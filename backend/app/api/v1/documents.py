"""Upload, list, download and delete documents."""

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser, DbSession, StorageDep
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.schemas.common import SuccessResponse
from app.schemas.document import (
    DeletedResponse,
    DocumentListResponse,
    DocumentResponse,
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
) -> StreamingResponse:
    """Stream the stored file back.

    The client asks for a document by id; it never names a path. The filename
    in the header is the user's original one, cleaned so it cannot break the
    header or suggest a directory.
    """
    service = DocumentService(db, storage)
    document = service.get_owned(document_id, current_user)
    filename = safe_download_name(document.original_filename)

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
