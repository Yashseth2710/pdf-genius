"""A record of one operation performed on one or more documents."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import JobStatus, OperationType
from app.models.mixins import Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.user import User


class ProcessingJob(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "processing_jobs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # Nullable because a merge has several inputs and no single source
    # document; the inputs are recorded in input_metadata instead.
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )

    operation: Mapped[OperationType] = mapped_column(
        Enum(OperationType, name="operation_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status", values_callable=lambda e: [m.value for m in e]),
        default=JobStatus.QUEUED,
        index=True,
        nullable=False,
    )

    # The options the job ran with - page ranges, rotation angle, watermark
    # text and so on. JSONB because every operation takes different settings,
    # and a column per option would be unworkable.
    input_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    # The documents this job produced, in the order they came out.
    #
    # A list rather than the single output_path the specification sketched:
    # splitting a document into twelve pages produces twelve results, and
    # bundling them into one archive to fit a single column made the archive
    # the thing the user received. An archive cannot be previewed, merged or
    # organised - it is the only dead end in the app - so the outputs are kept
    # as ordinary documents and zipped only if someone asks to download them
    # all at once.
    output_document_ids: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    # The reason a job failed, phrased for the user. Never a stack trace.
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="processing_jobs")
    document: Mapped["Document | None"] = relationship(back_populates="processing_jobs")

    def __repr__(self) -> str:
        return f"<ProcessingJob id={self.id} {self.operation} {self.status}>"
