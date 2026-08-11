"""Uploading, listing, downloading and deleting documents."""

import logging
import uuid
from collections.abc import Iterator, Sequence
from typing import BinaryIO

import pymupdf
from sqlalchemy.orm import Session

from app.core.errors import (
    FileTooLargeError,
    InvalidFileError,
    NotFoundError,
    UnsupportedFileTypeError,
)
from app.models import Document, User
from app.models.enums import DocumentStatus
from app.repositories.document import DocumentRepository
from app.services.files.validation import PDF, SNIFF_BYTES, sniff
from app.services.storage.base import Storage
from app.services.storage.keys import new_document_key
from app.services.storage.local import FileTooLargeInStorage

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(self, db: Session, storage: Storage) -> None:
        self.db = db
        self.storage = storage
        self.documents = DocumentRepository(db)

    def upload(
        self,
        *,
        user: User,
        stream: BinaryIO,
        original_filename: str,
        max_bytes: int,
        allowed_mime_types: Sequence[str],
    ) -> Document:
        """Take an uploaded file, check it is what it claims, and store it.

        The order matters: identify the file before writing it, cap the size
        while writing it, and confirm it actually opens before recording it.
        """
        head = stream.read(SNIFF_BYTES)
        stream.seek(0)

        file_type = sniff(head)
        if file_type is None or file_type.mime not in allowed_mime_types:
            # The filename and the browser's Content-Type were never consulted:
            # both are supplied by the uploader. A .exe renamed to .pdf is
            # rejected here.
            raise UnsupportedFileTypeError(
                "That file type is not supported. Upload a PDF, JPG or PNG."
            )

        key = new_document_key(user.id, file_type.extension)

        try:
            stored = self.storage.save(stream, key=key, max_bytes=max_bytes)
        except FileTooLargeInStorage as exc:
            raise FileTooLargeError(
                f"That file is larger than {max_bytes // (1024 * 1024)}MB."
            ) from exc

        # An empty file passes every signature check above by never matching,
        # but a zero-byte PDF would still be worth catching explicitly.
        if stored.size == 0:
            self.storage.delete(key)
            raise InvalidFileError("That file is empty.")

        page_count: int | None = None
        if file_type.mime == PDF:
            page_count = self._inspect_pdf(key)

        document = Document(
            user_id=user.id,
            original_filename=original_filename[:255],
            storage_path=key,
            mime_type=file_type.mime,
            file_size=stored.size,
            page_count=page_count,
            status=DocumentStatus.READY,
        )
        try:
            self.documents.add(document)
            self.db.commit()
        except Exception:
            # Do not leave an orphaned file behind if the row cannot be written.
            self.db.rollback()
            self.storage.delete(key)
            raise

        logger.info(
            "Stored document id=%s user=%s bytes=%d pages=%s",
            document.id,
            user.id,
            stored.size,
            page_count,
        )
        return document

    def _inspect_pdf(self, key: str) -> int:
        """Open the PDF to prove it is readable, and count its pages.

        A file can start with %PDF- and still be truncated or corrupt, so the
        header alone is not enough. Anything that fails to open is deleted
        rather than left on disk pretending to be a document.
        """
        try:
            with (
                self.storage.open(key) as handle,
                pymupdf.open(stream=handle.read(), filetype="pdf") as pdf,
            ):
                if pdf.needs_pass:
                    raise InvalidFileError(
                        "That PDF is password protected. Remove the password and try again."
                    )
                return int(pdf.page_count)
        except InvalidFileError:
            self.storage.delete(key)
            raise
        except Exception as exc:
            self.storage.delete(key)
            logger.info("Rejected an unreadable PDF: %s", exc.__class__.__name__)
            raise InvalidFileError(
                "That file appears to be corrupted and could not be opened."
            ) from exc

    def list_for_user(
        self, user: User, *, limit: int = 20, offset: int = 0
    ) -> tuple[Sequence[Document], int]:
        return (
            self.documents.list_for_user(user.id, limit=limit, offset=offset),
            self.documents.count_for_user(user.id),
        )

    def get_owned(self, document_id: uuid.UUID, user: User) -> Document:
        """Fetch a document belonging to this user, or 404.

        Someone else's document is reported as missing rather than forbidden:
        a 403 would confirm the id exists (spec section 17).
        """
        document = self.documents.get_for_user(document_id, user.id)
        if document is None:
            raise NotFoundError("That document does not exist.")
        return document

    def open_stream(self, document: Document) -> Iterator[bytes]:
        """Stream a stored document, so a download never loads it into memory."""
        if not self.storage.exists(document.storage_path):
            logger.error("Document id=%s has no file on disk", document.id)
            raise NotFoundError("That document is no longer available.")
        return self.storage.stream(document.storage_path)

    def delete(self, document: Document) -> None:
        """Remove the row first, then the file.

        This order is deliberate: if deleting the file fails, the user still
        sees the document gone, and the leftover file is cleaned up later. The
        reverse order could leave a row pointing at nothing.
        """
        key = document.storage_path
        self.documents.delete(document)
        self.db.commit()
        self.storage.delete(key)
        logger.info("Deleted document id=%s", document.id)
