"""history outlives the documents it is about

``processing_jobs.document_id`` cascaded, so deleting a PDF deleted every job
that mentioned it. That was harmless while jobs were a debugging aid. It is
wrong for a history screen: merge two files, tidy up afterwards, and the record
that you ever merged them is gone - silently, and in a way nobody notices until
their history looks oddly short.

The job now keeps its own record and forgets only which document it started
from. What it produced is unaffected either way: outputs are ordinary documents
listed in ``output_document_ids``, not a foreign key.

Revision ID: f6a15e3b92c7
Revises: e5c94d2a83f1
Create Date: 2026-08-14 09:30:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a15e3b92c7"
down_revision: str | Sequence[str] | None = "e5c94d2a83f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONSTRAINT = "fk_processing_jobs_document_id_documents"


def upgrade() -> None:
    """Upgrade schema."""
    # PostgreSQL has no way to alter a foreign key's delete action in place, so
    # the constraint is dropped and rebuilt. The column itself is untouched.
    op.drop_constraint(CONSTRAINT, "processing_jobs", type_="foreignkey")
    op.create_foreign_key(
        CONSTRAINT,
        "processing_jobs",
        "documents",
        ["document_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema.

    Going back loses nothing now, but any job whose source document has since
    been deleted already holds NULL - which the old CASCADE would never have
    produced. Those rows stay; they simply look like a merge, which has no
    single source document either.
    """
    op.drop_constraint(CONSTRAINT, "processing_jobs", type_="foreignkey")
    op.create_foreign_key(
        CONSTRAINT,
        "processing_jobs",
        "documents",
        ["document_id"],
        ["id"],
        ondelete="CASCADE",
    )
