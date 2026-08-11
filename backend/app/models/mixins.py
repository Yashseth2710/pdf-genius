"""Column mixins shared by every table."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPrimaryKey:
    """A UUID primary key.

    Chosen over an auto-incrementing integer because these ids appear in URLs:
    a sequential id would let anyone guess that /documents/124 exists straight
    after seeing /documents/123.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


class Timestamps:
    """created_at / updated_at, both maintained by the database.

    ``clock_timestamp()`` rather than ``now()``: PostgreSQL's ``now()`` is the
    time the *transaction* began and does not move while it runs, so two rows
    written by one request get byte-identical timestamps and any "newest first"
    ordering between them is arbitrary. ``clock_timestamp()`` reads the actual
    clock, which is what a created_at column is meant to record.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.clock_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.clock_timestamp(),
        onupdate=func.clock_timestamp(),
        nullable=False,
    )
