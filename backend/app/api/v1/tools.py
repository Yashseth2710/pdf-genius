"""The PDF tools: merge, organise, split, compress and convert.

All of them run inside the request. See ``app/services/jobs/service.py`` for
why there is no worker behind them.
"""

from fastapi import APIRouter, Request

from app.api.deps import CurrentUser, DbSession, StorageDep
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.rate_limit import limiter
from app.schemas.common import SuccessResponse
from app.schemas.document import DocumentResponse
from app.schemas.job import (
    CompressRequest,
    ImagesToPdfRequest,
    JobResponse,
    MergeRequest,
    OrganiseRequest,
    SplitRequest,
    ToolRunResponse,
)
from app.services.pdf.compress import CompressionLevel
from app.services.pdf.images import Orientation, PageSize
from app.services.pdf.operations import PlannedPage
from app.services.pdf.tools import ToolResult, ToolService

router = APIRouter(prefix="/tools", tags=["tools"])
settings = get_settings()


def _response(result: ToolResult) -> SuccessResponse[ToolRunResponse]:
    return SuccessResponse(
        data=ToolRunResponse(
            job=JobResponse.model_validate(result.job),
            outputs=[DocumentResponse.model_validate(output) for output in result.outputs],
        )
    )


@router.post(
    "/merge",
    response_model=SuccessResponse[ToolRunResponse],
    summary="Merge several PDFs into one",
)
@limiter.limit(settings.rate_limit_processing)
def merge_documents(
    request: Request,
    payload: MergeRequest,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> SuccessResponse[ToolRunResponse]:
    service = ToolService(db, storage, settings)
    result = service.merge(
        user=current_user,
        document_ids=payload.document_ids,
        output_name=payload.output_name,
    )
    return _response(result)


@router.post(
    "/organise",
    response_model=SuccessResponse[ToolRunResponse],
    summary="Rotate, reorder and remove pages",
)
@limiter.limit(settings.rate_limit_processing)
def organise_document(
    request: Request,
    payload: OrganiseRequest,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> SuccessResponse[ToolRunResponse]:
    """Rebuild a document from the pages the user kept, in their order.

    Rotating, reordering and deleting arrive together because that is how they
    are done — one pass over the document, one job, one result.
    """
    service = ToolService(db, storage, settings)
    result = service.organise(
        user=current_user,
        document_id=payload.document_id,
        plan=[PlannedPage(number=page.number, rotation=page.rotation) for page in payload.pages],
        output_name=payload.output_name,
    )
    return _response(result)


@router.post(
    "/compress",
    response_model=SuccessResponse[ToolRunResponse],
    summary="Make a PDF smaller",
)
@limiter.limit(settings.rate_limit_processing)
def compress_document(
    request: Request,
    payload: CompressRequest,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> SuccessResponse[ToolRunResponse]:
    """Compress a PDF and report the size it actually reached.

    A run that could not make the file meaningfully smaller comes back with no
    outputs and the measurements on the job. That is a completed job, not a
    failed one: the work was done and the answer is that there was nothing left
    to take out.
    """
    service = ToolService(db, storage, settings)
    result, _ = service.compress(
        user=current_user,
        document_id=payload.document_id,
        level=CompressionLevel(payload.level),
    )
    return _response(result)


@router.post(
    "/images-to-pdf",
    response_model=SuccessResponse[ToolRunResponse],
    summary="Combine images into one PDF",
)
@limiter.limit(settings.rate_limit_processing)
def images_to_pdf(
    request: Request,
    payload: ImagesToPdfRequest,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> SuccessResponse[ToolRunResponse]:
    service = ToolService(db, storage, settings)
    result = service.images_to_pdf(
        user=current_user,
        document_ids=payload.document_ids,
        page_size=PageSize(payload.page_size),
        orientation=Orientation(payload.orientation),
        output_name=payload.output_name,
    )
    return _response(result)


@router.post(
    "/split",
    response_model=SuccessResponse[ToolRunResponse],
    summary="Split one PDF into several",
)
@limiter.limit(settings.rate_limit_processing)
def split_document(
    request: Request,
    payload: SplitRequest,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> SuccessResponse[ToolRunResponse]:
    """Split by page ranges, into every page, or into a selection of pages.

    The mode decides which field is required. Checking it here rather than in
    the schema means the error names the field that is missing instead of
    reporting a union that did not match.
    """
    service = ToolService(db, storage, settings)

    if payload.mode == "ranges":
        if not payload.ranges or not payload.ranges.strip():
            raise AppError(
                "Enter the pages to split out, for example 1-3, 5.",
                code="INVALID_PAGE_RANGE",
            )
        result = service.split_by_ranges(
            user=current_user,
            document_id=payload.document_id,
            ranges_spec=payload.ranges,
        )
    elif payload.mode == "pages":
        if not payload.pages:
            raise AppError("Select at least one page.", code="INVALID_PAGE_RANGE")
        result = service.extract_pages(
            user=current_user,
            document_id=payload.document_id,
            pages=payload.pages,
        )
    else:
        result = service.split_every_page(user=current_user, document_id=payload.document_id)

    return _response(result)
