"""Schema checks that need no database - they read the mapper metadata.

These guard the decisions that are easy to break silently later: cascade rules,
indexes on columns we filter by, and enum values that the database stores.
"""

from app.core.database import Base
from app.models import (
    AIMessage,
    AISession,
    Document,
    DocumentStatus,
    JobStatus,
    MessageRole,
    OperationType,
    ProcessingJob,
    User,
)


def test_every_table_is_registered() -> None:
    assert set(Base.metadata.tables) == {
        "users",
        "documents",
        "processing_jobs",
        "ai_sessions",
        "ai_messages",
    }


def test_email_is_unique_and_indexed() -> None:
    email = User.__table__.c.email

    assert email.index is True
    assert email.unique is True


def test_user_owned_tables_index_user_id() -> None:
    """Every listing query filters on user_id, so it must be indexed."""
    for model in (Document, ProcessingJob, AISession):
        assert model.__table__.c.user_id.index is True, model.__tablename__


def test_deleting_a_user_takes_their_data_with_them() -> None:
    for model in (Document, ProcessingJob, AISession):
        fk = next(fk for fk in model.__table__.foreign_keys if fk.column.table.name == "users")
        assert fk.ondelete == "CASCADE", model.__tablename__


def test_deleting_a_document_takes_its_jobs_and_sessions() -> None:
    for model in (ProcessingJob, AISession):
        fk = next(fk for fk in model.__table__.foreign_keys if fk.column.table.name == "documents")
        assert fk.ondelete == "CASCADE", model.__tablename__


def test_a_job_can_exist_without_a_single_source_document() -> None:
    """Merge has several inputs, so document_id has to be optional."""
    assert ProcessingJob.__table__.c.document_id.nullable is True
    assert ProcessingJob.__table__.c.user_id.nullable is False


def test_storage_path_is_unique() -> None:
    """Two documents pointing at one file would make deletion destructive."""
    assert Document.__table__.c.storage_path.unique is True


def test_page_count_is_optional() -> None:
    """It is unknown until the file is opened, and never known if that fails."""
    assert Document.__table__.c.page_count.nullable is True


def test_messages_are_append_only() -> None:
    assert "created_at" in AIMessage.__table__.c
    assert "updated_at" not in AIMessage.__table__.c


def test_enum_values_match_the_specification() -> None:
    assert [s.value for s in JobStatus] == ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"]
    assert [r.value for r in MessageRole] == ["USER", "ASSISTANT"]
    assert [t.value for t in DocumentStatus] == ["UPLOADED", "READY", "FAILED"]
    assert [o.value for o in OperationType] == [
        "MERGE",
        "SPLIT",
        "COMPRESS",
        "CONVERT",
        "ROTATE",
        "EXTRACT",
        "WATERMARK",
        "OCR",
    ]


def test_full_name_joins_the_parts() -> None:
    user = User(first_name="Ada", last_name="Lovelace")

    assert user.full_name == "Ada Lovelace"


def test_repr_does_not_leak_personal_data() -> None:
    """Reprs end up in logs, so they must not carry an email address."""
    user = User(email="ada@example.com", first_name="Ada", last_name="Lovelace")

    assert "ada@example.com" not in repr(user)
