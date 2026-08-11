"""The user account everything else hangs off."""

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.ai import AISession
    from app.models.document import Document
    from app.models.processing_job import ProcessingJob


class User(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "users"

    # 320 is the maximum length of an email address per RFC 5321. Stored
    # lower-cased so "A@b.com" and "a@b.com" cannot become two accounts.
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    # An Argon2 hash, never a password. Sized for the longest hash Argon2 emits.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)

    documents: Mapped[list["Document"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    processing_jobs: Mapped[list["ProcessingJob"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    ai_sessions: Mapped[list["AISession"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def __repr__(self) -> str:
        # Deliberately no email: repr output ends up in logs.
        return f"<User id={self.id}>"
