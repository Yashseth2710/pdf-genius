"""add ORGANISE operation type

Rotating, reordering and removing pages are applied together from one page
plan, so they are one operation rather than three. None of the existing values
could describe a job that did all three at once.

Revision ID: c7e2b48f1a03
Revises: a3f1c07b9d24
Create Date: 2026-08-12 10:15:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7e2b48f1a03"
down_revision: str | Sequence[str] | None = "a3f1c07b9d24"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_WITHOUT_ORGANISE = (
    "MERGE",
    "SPLIT",
    "COMPRESS",
    "CONVERT",
    "ROTATE",
    "EXTRACT",
    "WATERMARK",
    "OCR",
)


def upgrade() -> None:
    """Upgrade schema."""
    # Safe inside a transaction on PostgreSQL 12 and later, as long as the new
    # value is not used by the same transaction - which it is not.
    op.execute("ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'ORGANISE'")


def downgrade() -> None:
    """Downgrade schema.

    PostgreSQL cannot remove a value from an enum, so the type is rebuilt
    without it. Any job recorded as ORGANISE is deleted first: the older type
    has no way to describe one, and inventing a different operation for it
    would put a lie in the user's history.
    """
    op.execute("DELETE FROM processing_jobs WHERE operation = 'ORGANISE'")

    values = ", ".join(f"'{value}'" for value in _WITHOUT_ORGANISE)
    op.execute("ALTER TYPE operation_type RENAME TO operation_type_old")
    op.execute(f"CREATE TYPE operation_type AS ENUM ({values})")
    op.execute(
        "ALTER TABLE processing_jobs ALTER COLUMN operation TYPE operation_type "
        "USING operation::text::operation_type"
    )
    op.execute("DROP TYPE operation_type_old")
