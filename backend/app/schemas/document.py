"""Request and response shapes for documents."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

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


class DeletedResponse(BaseModel):
    id: uuid.UUID
    deleted: bool = True
