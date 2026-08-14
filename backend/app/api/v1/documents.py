"""Upload, list, download and delete documents."""

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Query, Request, Response, UploadFile, status
from fastapi.responses import RedirectResponse, StreamingResponse

from app.api.deps import CurrentUser, DbSession, StorageDep
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.schemas.common import DeletedResponse, SuccessResponse
from app.schemas.document import (
    ArchiveRequest,
    DocumentListResponse,
    DocumentResponse,
    RecordUploadRequest,
    UploadTicket,
    UploadTicketRequest,
)
from app.services.files.service import DocumentService
from app.services.storage.keys import safe_download_name

router = APIRouter(prefix="/documents", tags=["documents"])
settings = get_settings()


@router.post(
    "/upload",
    response_model=SuccessResponse[DocumentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document",
)
@limiter.limit(settings.rate_limit_upload)
def upload_document(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
    file: Annotated[UploadFile, File(description="A PDF, JPG or PNG file")],
) -> SuccessResponse[DocumentResponse]:
    document = DocumentService(db, storage).upload(
        user=current_user,
        stream=file.file,
        original_filename=file.filename or "document",
        max_bytes=settings.max_upload_size_bytes,
        allowed_mime_types=settings.allowed_upload_type_list,
        quota_bytes=settings.storage_quota_bytes,
    )
    return SuccessResponse(data=DocumentResponse.model_validate(document))


@router.post(
    "/upload-ticket",
    response_model=SuccessResponse[UploadTicket],
    summary="Ask permission to upload directly to storage",
)
@limiter.limit(settings.rate_limit_upload)
def request_upload_ticket(
    request: Request,
    payload: UploadTicketRequest,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> SuccessResponse[UploadTicket]:
    """Reserve a storage key for a file the browser will upload itself.

    Needed because a serverless function cannot accept a 25MB body. Nothing is
    trusted here: the size is the client's claim, checked so an upload that
    obviously cannot fit is refused before it is made rather than after, and
    checked again for real once the bytes exist.
    """
    ticket = DocumentService(db, storage).issue_upload_ticket(
        user=current_user,
        filename=payload.filename,
        claimed_size=payload.size,
        max_bytes=settings.max_upload_size_bytes,
        quota_bytes=settings.storage_quota_bytes,
    )
    return SuccessResponse(data=ticket)


@router.post(
    "/record",
    response_model=SuccessResponse[DocumentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Record a direct upload",
)
@limiter.limit(settings.rate_limit_upload)
def record_upload(
    request: Request,
    payload: RecordUploadRequest,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> SuccessResponse[DocumentResponse]:
    """Check what actually landed in storage, then record it."""
    document = DocumentService(db, storage).record_uploaded(
        user=current_user,
        key=payload.key,
        original_filename=payload.filename,
        max_bytes=settings.max_upload_size_bytes,
        allowed_mime_types=settings.allowed_upload_type_list,
        quota_bytes=settings.storage_quota_bytes,
    )
    return SuccessResponse(data=DocumentResponse.model_validate(document))


@router.get(
    "",
    response_model=SuccessResponse[DocumentListResponse],
    summary="List your documents",
)
def list_documents(
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SuccessResponse[DocumentListResponse]:
    items, total = DocumentService(db, storage).list_for_user(
        current_user, limit=limit, offset=offset
    )
    return SuccessResponse(
        data=DocumentListResponse(
            items=[DocumentResponse.model_validate(item) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )
    )


@router.post(
    "/archive",
    summary="Download several documents as one zip",
    response_class=StreamingResponse,
)
def archive_documents(
    payload: ArchiveRequest,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> StreamingResponse:
    """Bundle documents into a zip, built now and never stored.

    A zip is a way of delivering several files at once, not a document: keeping
    one would put something in the user's list that cannot be previewed, merged
    or organised. Each id is resolved with the usual ownership check, so this
    cannot be used to reach a file belonging to someone else.
    """
    service = DocumentService(db, storage)
    documents = [
        service.get_owned(document_id, current_user) for document_id in payload.document_ids
    ]

    data = service.archive(documents)
    filename = safe_download_name(payload.name or "documents.zip", fallback="documents.zip")

    return StreamingResponse(
        iter([data]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(data)),
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get(
    "/{document_id}",
    response_model=SuccessResponse[DocumentResponse],
    summary="One document",
)
def get_document(
    document_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> SuccessResponse[DocumentResponse]:
    document = DocumentService(db, storage).get_owned(document_id, current_user)
    return SuccessResponse(data=DocumentResponse.model_validate(document))


@router.get(
    "/{document_id}/download",
    summary="Download a document",
    response_class=StreamingResponse,
)
def download_document(
    document_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> Response:
    """Stream the stored file back, or redirect to where it lives.

    The client asks for a document by id; it never names a path. The filename
    in the header is the user's original one, cleaned so it cannot break the
    header or suggest a directory.
    """
    service = DocumentService(db, storage)
    document = service.get_owned(document_id, current_user)
    filename = safe_download_name(document.original_filename)

    # Ownership has been checked above either way. When storage can serve the
    # file itself, hand the browser a URL rather than copying the bytes through
    # this process: a serverless function may not return a body larger than
    # 4.5MB, which is well under the 25MB a user is allowed to upload.
    direct = storage.url_for(document.storage_path)
    if direct is not None:
        return RedirectResponse(direct, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    return StreamingResponse(
        service.open_stream(document),
        media_type=document.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(document.file_size),
            # Stops a browser second-guessing the type we declared.
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete(
    "/{document_id}",
    response_model=SuccessResponse[DeletedResponse],
    summary="Delete a document",
)
def delete_document(
    document_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
) -> SuccessResponse[DeletedResponse]:
    service = DocumentService(db, storage)
    document = service.get_owned(document_id, current_user)
    service.delete(document)
    return SuccessResponse(data=DeletedResponse(id=document_id))
