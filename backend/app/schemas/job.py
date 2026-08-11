"""Request and response shapes for processing jobs and the tools that run them."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import JobStatus, OperationType
from app.schemas.document import DocumentResponse


class JobResponse(BaseModel):
    """A job as the API describes it.

    ``output_path`` is deliberately absent, for the same reason a document
    never publishes its storage path: the result is reached by its document id.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    operation: OperationType
    status: JobStatus
    document_id: uuid.UUID | None
    options: dict[str, Any] = Field(validation_alias="input_metadata")
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None


class JobListResponse(BaseModel):
    items: list[JobResponse]
    total: int
    limit: int
    offset: int


class ToolRunResponse(BaseModel):
    """What a finished tool run gives back: the job, and the file it produced."""

    job: JobResponse
    output: DocumentResponse


class MergeRequest(BaseModel):
    """Merge several PDFs, in the order the ids are listed.

    The order is the payload's, not the server's: it is what the user dragged
    the files into.
    """

    document_ids: list[uuid.UUID] = Field(min_length=2, max_length=20)
    # A default rather than a required field: most people merge and download
    # without ever thinking about the name.
    output_name: str = Field(default="merged.pdf", min_length=1, max_length=200)


class SplitRequest(BaseModel):
    """Split one PDF, in one of three ways.

    The mode decides which of the other fields matters, which is checked in the
    route rather than here so the message can name the missing field.
    """

    document_id: uuid.UUID
    mode: Literal["ranges", "every_page", "pages"]
    # For mode="ranges": free text as the user typed it, e.g. "1-3, 5, 8-10".
    ranges: str | None = Field(default=None, max_length=1000)
    # For mode="pages": explicit 1-based page numbers.
    pages: list[int] | None = Field(default=None, max_length=500)
