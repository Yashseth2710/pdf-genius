"""Reading back what has been processed."""

import uuid
from datetime import UTC, datetime, time
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.models.enums import JobStatus, OperationType
from app.repositories.job import JobFilters
from app.schemas.common import DeletedResponse, SuccessResponse
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
    status: JobStatus | None = None,
    date_from: Annotated[
        datetime | None, Query(description="Include jobs from the start of this day.")
    ] = None,
    date_to: Annotated[
        datetime | None, Query(description="Include jobs up to the end of this day.")
    ] = None,
) -> SuccessResponse[JobListResponse]:
    """Newest first, narrowed by any combination of the filters.

    The dates are inclusive at both ends, which is how a range reads to the
    person choosing it: "the 3rd to the 5th" plainly includes the 5th. A naive
    ``created_at <= date_to`` would exclude everything after midnight on the
    last day and quietly lose a day's work.
    """
    items, total = JobService(db).list_for_user(
        current_user,
        limit=limit,
        offset=offset,
        filters=JobFilters(
            operation=operation,
            status=status,
            created_after=_start_of_day(date_from),
            created_before=_end_of_day(date_to),
        ),
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


@router.delete(
    "/{job_id}",
    response_model=SuccessResponse[DeletedResponse],
    summary="Remove one entry from your history",
)
def delete_job(
    job_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[DeletedResponse]:
    """Forget that a job happened.

    Only the record goes. Whatever it produced stays in the user's documents:
    someone tidying their history has not asked to lose the files they made.
    """
    service = JobService(db)
    job = service.get_owned(job_id, current_user)
    service.delete(job)
    return SuccessResponse(data=DeletedResponse(id=job_id, deleted=True))


def _start_of_day(moment: datetime | None) -> datetime | None:
    """Midnight at the beginning of the given day, in UTC."""
    if moment is None:
        return None
    return _as_utc(datetime.combine(moment.date(), time.min, tzinfo=moment.tzinfo))


def _end_of_day(moment: datetime | None) -> datetime | None:
    """The last instant of the given day, so the range includes it."""
    if moment is None:
        return None
    return _as_utc(datetime.combine(moment.date(), time.max, tzinfo=moment.tzinfo))


def _as_utc(moment: datetime) -> datetime:
    """A date with no timezone means UTC, which is what the column stores."""
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)
