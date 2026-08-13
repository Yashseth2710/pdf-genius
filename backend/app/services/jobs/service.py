"""The processing job lifecycle, shared by every tool.

Jobs run inside the request that asked for them. A merge of a handful of PDFs
finishes in well under a second, and a background worker would mean Redis or
Celery — a running cost, and a second process to keep alive, for work that is
already fast (spec section 67, free-first).

The job row is still written for every operation, so the history screen and any
future move to a queue both find the record they expect. Only the *execution*
is synchronous; nothing about the data model assumes it.
"""

import logging
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.models import Document, ProcessingJob, User
from app.models.enums import JobStatus, OperationType
from app.repositories.job import JobFilters, ProcessingJobRepository

logger = logging.getLogger(__name__)


class JobService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.jobs = ProcessingJobRepository(db)

    def start(
        self,
        *,
        user: User,
        operation: OperationType,
        options: dict[str, Any],
        document_id: uuid.UUID | None = None,
    ) -> ProcessingJob:
        """Record a job as running, and commit it before the work begins.

        Committing first matters: if the process dies mid-merge, the row is
        left as PROCESSING rather than vanishing, which is the difference
        between a job that visibly failed and one that never existed.
        """
        job = ProcessingJob(
            user_id=user.id,
            document_id=document_id,
            operation=operation,
            status=JobStatus.PROCESSING,
            input_metadata=options,
        )
        self.jobs.add(job)
        self.db.commit()
        return job

    def complete(
        self,
        job: ProcessingJob,
        *,
        outputs: Sequence[Document],
        result: dict[str, Any] | None = None,
    ) -> ProcessingJob:
        """Mark a job done and record what it produced, in order.

        The order matters: for a split it is the order the ranges were asked
        for, and that is how the results are listed back to the user.

        ``result`` is for what the work revealed rather than what was asked
        for - the measured size a compression achieved, for instance. A job
        with no outputs is still a completed job: compressing a document that
        was already as small as it goes did everything it was asked to.
        """
        job.status = JobStatus.COMPLETED
        job.output_document_ids = [str(document.id) for document in outputs]
        if result is not None:
            job.result_metadata = result
        job.completed_at = datetime.now(UTC)
        self.db.commit()
        logger.info("Job id=%s %s completed with %d output(s)", job.id, job.operation, len(outputs))
        return job

    def fail(self, job: ProcessingJob, message: str) -> ProcessingJob:
        """Mark a job failed with a message written for the person who ran it.

        Never a stack trace: this string is returned by the history endpoint
        and shown in the UI.
        """
        job.status = JobStatus.FAILED
        job.error_message = message[:500]
        job.completed_at = datetime.now(UTC)
        self.db.commit()
        logger.info("Job id=%s %s failed: %s", job.id, job.operation, message)
        return job

    def fail_from(self, job: ProcessingJob, exc: Exception) -> None:
        """Record a failure, keeping our own messages and hiding everything else."""
        if isinstance(exc, AppError):
            self.fail(job, exc.message)
        else:
            logger.exception("Job id=%s crashed", job.id)
            self.fail(job, "Something went wrong while processing this document.")

    def get_owned(self, job_id: uuid.UUID, user: User) -> ProcessingJob:
        job = self.jobs.get_for_user(job_id, user.id)
        if job is None:
            raise NotFoundError("That job does not exist.")
        return job

    def list_for_user(
        self,
        user: User,
        *,
        limit: int = 20,
        offset: int = 0,
        filters: JobFilters | None = None,
    ) -> tuple[Sequence[ProcessingJob], int]:
        return (
            self.jobs.list_for_user(user.id, limit=limit, offset=offset, filters=filters),
            self.jobs.count_for_user(user.id, filters=filters),
        )

    def delete(self, job: ProcessingJob) -> None:
        """Remove one entry from the history.

        Only the record goes. Whatever the job produced stays: outputs are
        ordinary documents in the user's list, and someone tidying their
        history has not asked to lose the files they made.
        """
        self.jobs.delete(job)
        self.db.commit()
        logger.info("Deleted job id=%s", job.id)
