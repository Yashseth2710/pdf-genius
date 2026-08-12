"""Request and response shapes for processing jobs and the tools that run them."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import JobStatus, OperationType
from app.schemas.document import DocumentResponse


class JobResponse(BaseModel):
    """A job as the API describes it.

    Results are named by document id, never by storage path: where a file
    physically lives stays internal, exactly as it does for a document.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    operation: OperationType
    status: JobStatus
    document_id: uuid.UUID | None
    output_document_ids: list[uuid.UUID]
    options: dict[str, Any] = Field(validation_alias="input_metadata")
    # What the run turned out to be, as opposed to what it was asked to do:
    # the measured sizes a compression achieved, for instance. Empty for the
    # operations that have nothing to report beyond the files they made.
    result: dict[str, Any] = Field(validation_alias="result_metadata")
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None


class JobListResponse(BaseModel):
    items: list[JobResponse]
    total: int
    limit: int
    offset: int


class ToolRunResponse(BaseModel):
    """What a finished tool run gives back: the job, and the files it produced.

    Always a list, even for a merge that produces one file. A shape that
    changed with the number of results would only move the branching into
    every caller.
    """

    job: JobResponse
    outputs: list[DocumentResponse]


class MergeRequest(BaseModel):
    """Merge several PDFs, in the order the ids are listed.

    The order is the payload's, not the server's: it is what the user dragged
    the files into.
    """

    document_ids: list[uuid.UUID] = Field(min_length=2, max_length=20)
    # A default rather than a required field: most people merge and download
    # without ever thinking about the name.
    output_name: str = Field(default="merged.pdf", min_length=1, max_length=200)


class PlannedPageRequest(BaseModel):
    """One page the user is keeping, and how far to turn it."""

    number: int = Field(ge=1, le=10_000)
    # Clockwise degrees on top of however the page already sits, so 0 leaves it
    # alone. Only quarter turns: anything else is a design tool's job.
    rotation: Literal[0, 90, 180, 270] = 0


class OrganiseRequest(BaseModel):
    """The pages to keep, in the order to keep them.

    One request covers rotating, reordering and deleting, because that is how
    the user does it — a page dropped is a page missing from this list, and the
    order of the list is the order of the result.
    """

    document_id: uuid.UUID
    pages: list[PlannedPageRequest] = Field(min_length=1, max_length=500)
    output_name: str | None = Field(default=None, max_length=200)


class CompressRequest(BaseModel):
    """How hard to try. What that achieves is only known afterwards."""

    document_id: uuid.UUID
    level: Literal["basic", "balanced", "strong"] = "balanced"


class ImagesToPdfRequest(BaseModel):
    """Images to bind into one PDF, in the order they are listed.

    The order is the payload's: it is what the user dragged the thumbnails
    into, and sorting it here would silently ignore them.
    """

    document_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)
    # "match" gives each page the size of its own image, which is what someone
    # assembling scans that are already the right shape wants.
    page_size: Literal["a4", "letter", "match"] = "a4"
    # "auto" lets each page follow its own image, so a mixed batch of photos
    # does not put the landscape ones in a portrait letterbox.
    orientation: Literal["portrait", "landscape", "auto"] = "auto"
    output_name: str = Field(default="images.pdf", min_length=1, max_length=200)


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
