"""Request and response shapes for documents."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DocumentStatus


class DocumentResponse(BaseModel):
    """A document as the API describes it.

    Note what is absent: storage_path. Where a file physically lives is an
    internal detail, and publishing it invites people to try reaching it.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_filename: str
    mime_type: str
    file_size: int
    page_count: int | None
    status: DocumentStatus
    created_at: datetime


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
    limit: int
    offset: int


class UploadTicketRequest(BaseModel):
    """Asking permission to upload straight to object storage."""

    filename: str = Field(min_length=1, max_length=255)
    # What the browser believes it is about to send. Treated as a hint for
    # naming and an early rejection only: the real type is read from the bytes
    # once they have landed, which is the check that counts.
    size: int = Field(ge=1)


class UploadTicket(BaseModel):
    """Where the browser may write, and what it may write there."""

    key: str
    max_bytes: int


class RecordUploadRequest(BaseModel):
    """Telling us an upload finished, so it can be checked and recorded."""

    key: str = Field(min_length=1, max_length=512)
    filename: str = Field(min_length=1, max_length=255)


class ArchiveRequest(BaseModel):
    """Documents to bundle into one download.

    Capped because the whole archive is built in memory: it is a convenience
    for collecting a split, not a way to export an entire account.
    """

    document_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    name: str | None = Field(default=None, max_length=200)
