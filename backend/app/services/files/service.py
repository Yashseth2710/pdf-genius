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
    StorageQuotaError,
    UnsupportedFileTypeError,
)
from app.models import Document, User
from app.models.enums import DocumentStatus
from app.repositories.document import DocumentRepository
from app.schemas.document import UploadTicket
from app.services.files.validation import EXTENSIONS, PDF, SNIFF_BYTES, sniff
from app.services.storage.base import Storage
from app.services.storage.keys import (
    UnsafeStorageKeyError,
    new_document_key,
    new_output_key,
    safe_download_name,
    validate_key,
)
from app.services.storage.local import FileTooLargeInStorage

logger = logging.getLogger(__name__)


def _accepted(mime_types: Sequence[str]) -> str:
    """The accepted types, written out for the person who just guessed wrong.

    Built from the list actually in force rather than written as a sentence,
    because the two drift: the setting can be narrowed by an environment
    variable, and a message that names formats the server then refuses is worse
    than one that names none. This one cannot be wrong.
    """
    names = [EXTENSIONS[mime].upper() for mime in mime_types if mime in EXTENSIONS]
    if not names:
        return "a supported file"
    if len(names) == 1:
        return f"a {names[0]}"
    return f"a {', '.join(names[:-1])} or {names[-1]}"


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
        quota_bytes: int | None = None,
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
                f"That file type is not supported. Upload {_accepted(allowed_mime_types)}."
            )

        # The quota becomes a second ceiling on this one write, so an upload
        # that would overrun it aborts mid-stream exactly as an oversized one
        # does. Checking afterwards would mean writing the whole file to disk
        # to discover there was no room for it - which is the thing the quota
        # exists to prevent.
        ceiling = max_bytes
        if quota_bytes is not None:
            remaining = quota_bytes - self.documents.total_bytes_for_user(user.id)
            if remaining <= 0:
                raise StorageQuotaError(
                    f"You have used all {quota_bytes // (1024 * 1024)}MB of your storage. "
                    "Delete a document to free some space."
                )
            ceiling = min(max_bytes, remaining)

        key = new_document_key(user.id, file_type.extension)

        try:
            stored = self.storage.save(stream, key=key, max_bytes=ceiling)
        except FileTooLargeInStorage as exc:
            # Both limits abort the same way, so which one was hit is decided
            # by which one was lower. Saying "larger than 25MB" to someone with
            # 3MB of room left would send them looking for the wrong problem.
            if ceiling < max_bytes:
                raise StorageQuotaError(
                    f"That file does not fit in your remaining "
                    f"{ceiling // (1024 * 1024)}MB of storage. "
                    "Delete a document to free some space."
                ) from exc
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

    def issue_upload_ticket(
        self,
        *,
        user: User,
        filename: str,
        claimed_size: int,
        max_bytes: int,
        quota_bytes: int | None = None,
    ) -> "UploadTicket":
        """Reserve a key for a browser to upload to, or refuse now.

        The refusals here are a courtesy rather than a control: they save
        someone a 25MB upload that was always going to be rejected. The
        controls are in ``record_uploaded``, which sees the real bytes.

        The extension comes from the filename, which is the uploader's text -
        so it is used only to name the object, never to decide what the file
        is. ``new_document_key`` sanitises it and the rest of the key is a
        UUID we generate.
        """
        remaining = max_bytes
        if quota_bytes is not None:
            free = quota_bytes - self.documents.total_bytes_for_user(user.id)
            if free <= 0:
                raise StorageQuotaError(
                    f"You have used all {quota_bytes // (1024 * 1024)}MB of your storage. "
                    "Delete a document to free some space."
                )
            remaining = min(max_bytes, free)

        if claimed_size > remaining:
            if remaining < max_bytes:
                raise StorageQuotaError(
                    f"That file does not fit in your remaining "
                    f"{remaining // (1024 * 1024)}MB of storage. "
                    "Delete a document to free some space."
                )
            raise FileTooLargeError(f"That file is larger than {max_bytes // (1024 * 1024)}MB.")

        suffix = safe_download_name(filename).rsplit(".", 1)
        extension = suffix[1][:10] if len(suffix) == 2 and suffix[1].isalnum() else "bin"

        return UploadTicket(key=new_document_key(user.id, extension), max_bytes=remaining)

    def record_uploaded(
        self,
        *,
        user: User,
        key: str,
        original_filename: str,
        max_bytes: int,
        allowed_mime_types: Sequence[str],
        quota_bytes: int | None = None,
    ) -> Document:
        """Record a file the browser uploaded straight to object storage.

        Used where the application never sees the upload: a serverless function
        may not accept a body anywhere near the 25MB limit, so the browser
        writes to storage directly and then tells us where it landed.

        That means every check ``upload`` makes *while* writing has to be made
        again here, against what actually arrived rather than against what the
        client said it was sending. A caller that claims a small PDF and
        uploads a large executable is refused at exactly the same points - the
        difference is only that the file is deleted afterwards instead of never
        being written.
        """
        # This is the first place a *client-supplied* key reaches validation -
        # every other caller passes a key we generated. An unsafe one is
        # answered as a missing file rather than as an error, because the
        # difference between "malformed" and "not yours" is information.
        try:
            validate_key(key)
        except UnsafeStorageKeyError as exc:
            logger.warning("Refused an unsafe key from user=%s", user.id)
            raise NotFoundError("That upload was not found.") from exc

        # The only prefix this user could have been given. Without this check,
        # an authenticated caller could name someone else's object and have it
        # recorded as their own document.
        if not key.startswith(f"documents/{user.id}/"):
            raise NotFoundError("That upload was not found.")

        if not self.storage.exists(key):
            raise NotFoundError("That upload was not found.")

        with self.storage.open(key) as handle:
            data = handle.read()

        # Every rejection below deletes first and raises second, so a refused
        # upload never stays in the store. There is no `finally` doing this
        # because a *successful* record must keep the file.
        if not data:
            self.storage.delete(key)
            raise InvalidFileError("That file is empty.")

        if len(data) > max_bytes:
            self.storage.delete(key)
            raise FileTooLargeError(f"That file is larger than {max_bytes // (1024 * 1024)}MB.")

        file_type = sniff(data[:SNIFF_BYTES])
        if file_type is None or file_type.mime not in allowed_mime_types:
            self.storage.delete(key)
            raise UnsupportedFileTypeError(
                f"That file type is not supported. Upload {_accepted(allowed_mime_types)}."
            )

        # Checked after the fact here rather than as a ceiling on the write,
        # because there was no write to put a ceiling on.
        if quota_bytes is not None:
            remaining = quota_bytes - self.documents.total_bytes_for_user(user.id)
            if len(data) > remaining:
                self.storage.delete(key)
                raise StorageQuotaError(
                    f"That file does not fit in your remaining "
                    f"{max(0, remaining) // (1024 * 1024)}MB of storage. "
                    "Delete a document to free some space."
                )

        page_count = self._inspect_pdf(key) if file_type.mime == PDF else None

        document = Document(
            user_id=user.id,
            original_filename=original_filename[:255],
            storage_path=key,
            mime_type=file_type.mime,
            file_size=len(data),
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

        logger.info(
            "Recorded direct upload id=%s user=%s bytes=%d pages=%s",
            document.id,
            user.id,
            len(data),
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
        quota_bytes: int | None = None,
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

        # Results count against the quota too, or the cap would be trivial to
        # walk past: split a 20MB PDF into a hundred pages and the account is
        # holding twice what it uploaded. Checked before the write rather than
        # streamed against a ceiling like an upload is, because this file is
        # already in memory and its size is known exactly.
        if quota_bytes is not None:
            used = self.documents.total_bytes_for_user(user.id)
            if used + len(data) > quota_bytes:
                raise StorageQuotaError(
                    "There is not enough room in your storage for the result. "
                    "Delete a document and run this again."
                )

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
