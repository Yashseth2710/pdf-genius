"""An uploaded file and the metadata we keep about it."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import DocumentStatus
from app.models.mixins import Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.ai import AISession
    from app.models.processing_job import ProcessingJob
    from app.models.user import User


class Document(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "documents"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        # Deleting an account removes its documents; nothing should outlive
        # the user it belongs to.
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # What the user called it - shown in the UI, never used as a filesystem path.
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Where we actually put it, under a name we generated.
    storage_path: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(127), nullable=False)
    # BigInteger because a 2GB int limit is uncomfortably close for scanned PDFs.
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Unknown until the file has been opened, and never known for a failed upload.
    page_count: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(
            DocumentStatus, name="document_status", values_callable=lambda e: [m.value for m in e]
        ),
        default=DocumentStatus.UPLOADED,
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="documents")
    processing_jobs: Mapped[list["ProcessingJob"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    ai_sessions: Mapped[list["AISession"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<Document id={self.id} status={self.status}>"
