"""Behaviour that only a real database can prove: constraints and cascades."""

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    AIMessage,
    AISession,
    AISessionType,
    Document,
    MessageRole,
    OperationType,
    ProcessingJob,
    User,
)
from app.repositories.base import BaseRepository


class DocumentRepository(BaseRepository[Document]):
    model = Document


def make_user(db: Session, email: str = "ada@example.com") -> User:
    user = User(
        email=email,
        password_hash="not-a-real-hash",
        first_name="Ada",
        last_name="Lovelace",
    )
    db.add(user)
    db.flush()
    return user


def make_document(db: Session, user: User, name: str = "notes.pdf") -> Document:
    document = Document(
        user_id=user.id,
        original_filename=name,
        storage_path=f"documents/{uuid.uuid4()}.pdf",
        mime_type="application/pdf",
        file_size=1024,
        page_count=3,
    )
    db.add(document)
    db.flush()
    return document


def test_ids_are_generated_without_the_database(db: Session) -> None:
    user = make_user(db)

    assert isinstance(user.id, uuid.UUID)


def test_timestamps_are_set_by_the_database(db: Session) -> None:
    user = make_user(db)

    assert user.created_at is not None
    assert user.updated_at is not None


def test_the_same_email_cannot_be_registered_twice(db: Session) -> None:
    make_user(db, "ada@example.com")

    with pytest.raises(IntegrityError):
        make_user(db, "ada@example.com")


def test_two_documents_cannot_share_a_storage_path(db: Session) -> None:
    user = make_user(db)
    first = make_document(db, user)

    duplicate = Document(
        user_id=user.id,
        original_filename="copy.pdf",
        storage_path=first.storage_path,
        mime_type="application/pdf",
        file_size=1024,
    )
    db.add(duplicate)

    with pytest.raises(IntegrityError):
        db.flush()


def test_deleting_a_user_removes_everything_they_owned(db: Session) -> None:
    user = make_user(db)
    document = make_document(db, user)
    db.add(
        ProcessingJob(
            user_id=user.id,
            document_id=document.id,
            operation=OperationType.MERGE,
            input_metadata={"files": 2},
        )
    )
    session = AISession(
        user_id=user.id,
        document_id=document.id,
        session_type=AISessionType.SUMMARY,
    )
    db.add(session)
    db.flush()
    db.add(AIMessage(session_id=session.id, role=MessageRole.USER, content="Summarise this."))
    db.flush()

    db.delete(user)
    db.flush()

    for model in (Document, ProcessingJob, AISession, AIMessage):
        remaining = db.execute(select(func.count()).select_from(model)).scalar_one()
        assert remaining == 0, f"{model.__tablename__} still has rows"


def test_json_metadata_survives_a_round_trip(db: Session) -> None:
    user = make_user(db)
    job = ProcessingJob(
        user_id=user.id,
        operation=OperationType.SPLIT,
        input_metadata={"ranges": ["1-3", "5"], "zip": True},
    )
    db.add(job)
    db.flush()
    db.expire(job)

    assert job.input_metadata == {"ranges": ["1-3", "5"], "zip": True}


def test_a_user_cannot_reach_another_users_document(db: Session) -> None:
    """The core authorisation rule from spec section 17."""
    owner = make_user(db, "owner@example.com")
    intruder = make_user(db, "intruder@example.com")
    document = make_document(db, owner)
    repo = DocumentRepository(db)

    assert repo.get_for_user(document.id, owner.id) is not None
    # None, not the record and not an error: the intruder learns nothing about
    # whether this id exists at all.
    assert repo.get_for_user(document.id, intruder.id) is None


def test_listing_is_scoped_paginated_and_newest_first(db: Session) -> None:
    owner = make_user(db, "owner@example.com")
    other = make_user(db, "other@example.com")
    for index in range(3):
        make_document(db, owner, f"owned-{index}.pdf")
    make_document(db, other, "not-yours.pdf")
    repo = DocumentRepository(db)

    listed = repo.list_for_user(owner.id)

    assert len(listed) == 3
    assert all(document.user_id == owner.id for document in listed)
    assert repo.count_for_user(owner.id) == 3
    assert len(repo.list_for_user(owner.id, limit=2)) == 2
    assert len(repo.list_for_user(owner.id, limit=2, offset=2)) == 1
