"""Database access for processing jobs."""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, select

from app.models import ProcessingJob
from app.models.enums import JobStatus, OperationType
from app.repositories.base import BaseRepository


@dataclass(frozen=True)
class JobFilters:
    """How a history screen narrows what it is looking at.

    One object rather than four arguments repeated twice, because the list and
    the count *must* agree: a page showing five rows out of a total counted a
    different way is a paginator that walks off the end.
    """

    operation: OperationType | None = None
    status: JobStatus | None = None
    # Inclusive at both ends, as a date range reads to the person choosing it.
    created_after: datetime | None = None
    created_before: datetime | None = None


class ProcessingJobRepository(BaseRepository[ProcessingJob]):
    model = ProcessingJob

    def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        limit: int = 20,
        offset: int = 0,
        filters: JobFilters | None = None,
    ) -> Sequence[ProcessingJob]:
        """Newest first, narrowed by whatever the caller asked for."""
        stmt = (
            select(ProcessingJob)
            .where(*self._conditions(user_id, filters))
            .order_by(ProcessingJob.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return self.db.execute(stmt).scalars().all()

    def count_for_user(self, user_id: uuid.UUID, *, filters: JobFilters | None = None) -> int:
        stmt = (
            select(func.count())
            .select_from(ProcessingJob)
            .where(*self._conditions(user_id, filters))
        )
        return self.db.execute(stmt).scalar_one()

    def _conditions(
        self, user_id: uuid.UUID, filters: JobFilters | None
    ) -> list[ColumnElement[bool]]:
        """Every condition both queries run, built once so they cannot diverge."""
        where: list[ColumnElement[bool]] = [ProcessingJob.user_id == user_id]
        if filters is None:
            return where

        if filters.operation is not None:
            where.append(ProcessingJob.operation == filters.operation)
        if filters.status is not None:
            where.append(ProcessingJob.status == filters.status)
        if filters.created_after is not None:
            where.append(ProcessingJob.created_at >= filters.created_after)
        if filters.created_before is not None:
            where.append(ProcessingJob.created_at <= filters.created_before)

        return where
