"""jobs point at many output documents

A job could only record one output, so a split into twelve pages had to be
bundled into one archive to fit. That made the archive the thing the user
received - and an archive cannot be previewed, merged or organised, so it was
the only dead end in the app.

Outputs are now ordinary documents, listed on the job in the order they came
out. Downloading several at once zips them on the way out instead.

Revision ID: d4b83c19f7e2
Revises: c7e2b48f1a03
Create Date: 2026-08-12 15:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d4b83c19f7e2"
down_revision: str | Sequence[str] | None = "c7e2b48f1a03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "processing_jobs",
        sa.Column(
            "output_document_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            # Only so the NOT NULL can be added to rows that already exist.
            # Dropped again below, because the application always supplies a
            # value and a default left behind here would show up as drift
            # against the model for ever after.
            server_default="[]",
            nullable=False,
        ),
    )
    op.alter_column("processing_jobs", "output_document_ids", server_default=None)

    # Existing jobs keep their history, but their output cannot be recovered
    # here: output_path holds a storage key, and turning that back into a
    # document id means a join this migration has no business doing. Old jobs
    # therefore list no outputs, which is honest - the documents themselves are
    # untouched and still in the user's list.
    op.drop_column("processing_jobs", "output_path")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "processing_jobs",
        sa.Column("output_path", sa.String(length=512), nullable=True),
    )
    op.drop_column("processing_jobs", "output_document_ids")
