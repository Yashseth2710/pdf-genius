"""use clock_timestamp for row timestamps

PostgreSQL's now() is the time the *transaction* started and does not advance
while it runs, so two rows written by the same request get identical
timestamps and "newest first" between them is arbitrary. clock_timestamp()
reads the real clock, which is what these columns are meant to record.

Only the default changes. Existing rows keep the values they already have -
backfilling them would invent an ordering that was never observed.

Revision ID: a3f1c07b9d24
Revises: fadfd5d6621c
Create Date: 2026-08-11 21:40:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3f1c07b9d24"
down_revision: str | Sequence[str] | None = "fadfd5d6621c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, column) pairs carrying a timestamp default.
_COLUMNS: list[tuple[str, str]] = [
    ("users", "created_at"),
    ("users", "updated_at"),
    ("documents", "created_at"),
    ("documents", "updated_at"),
    ("processing_jobs", "created_at"),
    ("processing_jobs", "updated_at"),
    ("ai_sessions", "created_at"),
    ("ai_sessions", "updated_at"),
    ("ai_messages", "created_at"),
]


def _set_default(expression: str) -> None:
    for table, column in _COLUMNS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT {expression}")


def upgrade() -> None:
    """Upgrade schema."""
    _set_default("clock_timestamp()")


def downgrade() -> None:
    """Downgrade schema."""
    _set_default("now()")
