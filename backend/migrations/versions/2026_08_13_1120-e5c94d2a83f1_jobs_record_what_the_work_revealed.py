"""jobs record what the work revealed

Compression is the reason. How much smaller a PDF gets cannot be predicted from
the setting - the same level takes 90% off a phone-camera scan and nothing off
a text document - so the only honest number is the one measured afterwards, and
it has to be stored or reloading the page loses it.

``input_metadata`` was the wrong home for it: that column holds what the job was
asked to do, and writing a result into it would make the name a lie.

Revision ID: e5c94d2a83f1
Revises: d4b83c19f7e2
Create Date: 2026-08-13 11:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e5c94d2a83f1"
down_revision: str | Sequence[str] | None = "d4b83c19f7e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "processing_jobs",
        sa.Column(
            "result_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            # Present only long enough to fill the rows that already exist, then
            # dropped: the application always supplies a value, and a default
            # left in the database would read as drift against the model.
            server_default="{}",
            nullable=False,
        ),
    )
    op.alter_column("processing_jobs", "result_metadata", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("processing_jobs", "result_metadata")
