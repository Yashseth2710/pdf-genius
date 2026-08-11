"""AI conversations about a document: a session holding a list of messages."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AISessionType, MessageRole
from app.models.mixins import Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.user import User


class AISession(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "ai_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    session_type: Mapped[AISessionType] = mapped_column(
        Enum(
            AISessionType,
            name="ai_session_type",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="ai_sessions")
    document: Mapped["Document"] = relationship(back_populates="ai_sessions")
    messages: Mapped[list["AIMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AIMessage.created_at",
    )

    def __repr__(self) -> str:
        return f"<AISession id={self.id} type={self.session_type}>"


class AIMessage(UUIDPrimaryKey, Base):
    __tablename__ = "ai_messages"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_sessions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role: Mapped[MessageRole] = mapped_column(
        Enum(MessageRole, name="message_role", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Messages are appended and never edited, so this table carries created_at
    # on its own rather than the full Timestamps mixin.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    session: Mapped["AISession"] = relationship(back_populates="messages")

    def __repr__(self) -> str:
        return f"<AIMessage id={self.id} role={self.role}>"
