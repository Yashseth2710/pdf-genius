"""Uploading, listing, downloading and deleting documents."""

import logging
import uuid
import zipfile
from collections.abc import Iterator, Sequence
from io import BytesIO
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
from app.services.files.validation import EXTENSIONS, PDF, SNIFF_BYTES, sniff
from app.services.storage.base import Storage
from app.services.storage.keys import new_document_key, new_output_key, safe_download_name
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

    def store_output(
        self,
        *,
        user: User,
        data: bytes,
        filename: str,
        mime_type: str,
        page_count: int | None,
    ) -> Document:
        """Save a file we produced as a document in its own right.

        Results land in the same list as uploads, which means download, delete
        and ownership all work through the code that already exists rather than
        through a parallel set of endpoints for "outputs".

        The key goes under ``outputs/`` rather than ``documents/`` so a future
        retention sweep can tell the two apart: an upload is the user's only
        copy, while a result can be produced again.
        """
        extension = EXTENSIONS.get(mime_type, "bin")
        key = new_output_key(user.id, extension)

        # No size check against the upload limit here: this file is ours, not
        # the client's, and the ceiling on it was applied to the inputs.
        stored = self.storage.save(BytesIO(data), key=key, max_bytes=len(data))

        document = Document(
            user_id=user.id,
            original_filename=filename[:255],
            storage_path=key,
            mime_type=mime_type,
            file_size=stored.size,
            page_count=page_count,
            status=DocumentStatus.READY,
        )
        try:
            self.documents.add(document)
            self.db.commit()
        except Exception:
            self.db.rollback()
            self.storage.delete(key)
            raise

        logger.info("Stored output id=%s user=%s bytes=%d", document.id, user.id, stored.size)
        return document

    def archive(self, documents: Sequence[Document]) -> bytes:
        """Zip several documents together for a single download.

        Built on demand and never stored: an archive is a delivery format, not
        a document. Keeping one would put something in the user's list that
        cannot be previewed, merged or organised.

        Names are made unique inside the archive - two ranges of the same
        source can easily both be called ``report-1-3.pdf`` - because a zip
        with duplicate entries silently loses files in some extractors.
        """
        buffer = BytesIO()
        used: dict[str, int] = {}

        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            for document in documents:
                name = safe_download_name(document.original_filename)
                seen = used.get(name, 0)
                used[name] = seen + 1
                if seen:
                    stem, _, suffix = name.rpartition(".")
                    name = f"{stem} ({seen}).{suffix}" if stem else f"{name} ({seen})"

                bundle.writestr(name, self.read_bytes(document))

        return buffer.getvalue()

    def read_bytes(self, document: Document) -> bytes:
        """Load a stored document into memory for processing.

        Processing genuinely needs the whole file - PyMuPDF cannot merge a
        stream it has only partly seen - which is why the merge limits in
        settings exist.
        """
        if not self.storage.exists(document.storage_path):
            logger.error("Document id=%s has no file on disk", document.id)
            raise NotFoundError("That document is no longer available.")
        with self.storage.open(document.storage_path) as handle:
            return handle.read()

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
