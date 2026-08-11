"""Database access for processing jobs."""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select

from app.models import ProcessingJob
from app.models.enums import OperationType
from app.repositories.base import BaseRepository


class ProcessingJobRepository(BaseRepository[ProcessingJob]):
    model = ProcessingJob

    def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        limit: int = 20,
        offset: int = 0,
        operation: OperationType | None = None,
    ) -> Sequence[ProcessingJob]:
        """Newest first, optionally narrowed to one kind of operation.

        The operation filter is what the history screen in scope 9 needs; it
        lives here rather than in that scope so there is one query to trust.
        """
        stmt = select(ProcessingJob).where(ProcessingJob.user_id == user_id)
        if operation is not None:
            stmt = stmt.where(ProcessingJob.operation == operation)
        stmt = stmt.order_by(ProcessingJob.created_at.desc()).limit(limit).offset(offset)
        return self.db.execute(stmt).scalars().all()

    def count_for_user(self, user_id: uuid.UUID, *, operation: OperationType | None = None) -> int:
        stmt = (
            select(func.count()).select_from(ProcessingJob).where(ProcessingJob.user_id == user_id)
        )
        if operation is not None:
            stmt = stmt.where(ProcessingJob.operation == operation)
        return self.db.execute(stmt).scalar_one()
