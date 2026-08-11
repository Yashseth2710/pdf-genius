"""Reading back what has been processed.

The full history screen belongs to scope 9; these two endpoints exist now
because a tool that reports "failed" is useless if there is nowhere to see why.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.models.enums import OperationType
from app.schemas.common import SuccessResponse
from app.schemas.job import JobListResponse, JobResponse
from app.services.jobs import JobService

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=SuccessResponse[JobListResponse], summary="Your processing history")
def list_jobs(
    current_user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    operation: OperationType | None = None,
) -> SuccessResponse[JobListResponse]:
    items, total = JobService(db).list_for_user(
        current_user, limit=limit, offset=offset, operation=operation
    )
    return SuccessResponse(
        data=JobListResponse(
            items=[JobResponse.model_validate(item) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )
    )


@router.get("/{job_id}", response_model=SuccessResponse[JobResponse], summary="One job")
def get_job(
    job_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[JobResponse]:
    job = JobService(db).get_owned(job_id, current_user)
    return SuccessResponse(data=JobResponse.model_validate(job))
