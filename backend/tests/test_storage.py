"""Storage keys and the filesystem boundary.

The rule under test: a stored file can only ever land inside the storage root,
whatever a filename or a database row says.
"""

import io
import uuid
from pathlib import Path

import pytest

from app.services.storage.keys import (
    UnsafeStorageKeyError,
    new_document_key,
    safe_download_name,
    validate_key,
)
from app.services.storage.local import FileTooLargeInStorage, LocalStorage


@pytest.fixture
def storage(tmp_path: Path) -> LocalStorage:
    return LocalStorage(tmp_path / "storage")


def test_generated_keys_are_unique_and_scoped_to_the_user() -> None:
    user_id = uuid.uuid4()

    first = new_document_key(user_id, "pdf")
    second = new_document_key(user_id, "pdf")

    assert first != second
    assert first.startswith(f"documents/{user_id}/")
    assert first.endswith(".pdf")


def test_the_users_filename_never_appears_in_the_key() -> None:
    """The name is generated, so a filename cannot become a path."""
    key = new_document_key(uuid.uuid4(), "pdf")

    assert "my report" not in key
    assert ".." not in key


@pytest.mark.parametrize(
    "key",
    [
        "../etc/passwd",
        "documents/../../etc/passwd",
        "/etc/passwd",
        "C:/Windows/System32/config",
        "documents/..",
        "",
        "documents/\x00evil.pdf",
        "documents/" + "a" * 500,
    ],
)
def test_unsafe_keys_are_refused(key: str) -> None:
    with pytest.raises(UnsafeStorageKeyError):
        validate_key(key)


def test_a_traversing_key_cannot_reach_outside_the_root(storage: LocalStorage) -> None:
    """Even a tampered database row must not be able to read arbitrary files."""
    with pytest.raises(UnsafeStorageKeyError):
        storage.open("../../../etc/passwd")


def test_a_file_round_trips(storage: LocalStorage) -> None:
    key = new_document_key(uuid.uuid4(), "pdf")

    stored = storage.save(io.BytesIO(b"%PDF-1.7 hello"), key=key, max_bytes=1024)

    assert stored.size == 14
    assert storage.exists(key)
    assert b"".join(storage.stream(key)) == b"%PDF-1.7 hello"


def test_writing_stops_at_the_limit_and_leaves_nothing_behind(
    storage: LocalStorage,
) -> None:
    """A file over the limit must not sit on disk while we decide about it."""
    key = new_document_key(uuid.uuid4(), "pdf")
    oversized = io.BytesIO(b"x" * 5000)

    with pytest.raises(FileTooLargeInStorage):
        storage.save(oversized, key=key, max_bytes=1000)

    assert not storage.exists(key)


def test_deleting_is_idempotent(storage: LocalStorage) -> None:
    key = new_document_key(uuid.uuid4(), "pdf")
    storage.save(io.BytesIO(b"data"), key=key, max_bytes=100)

    storage.delete(key)
    storage.delete(key)  # deleting again must not raise

    assert not storage.exists(key)


def test_files_land_inside_the_root(storage: LocalStorage, tmp_path: Path) -> None:
    key = new_document_key(uuid.uuid4(), "pdf")

    storage.save(io.BytesIO(b"data"), key=key, max_bytes=100)

    written = list((tmp_path / "storage").rglob("*.pdf"))
    assert len(written) == 1
    assert written[0].is_relative_to(tmp_path / "storage")


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("report.pdf", "report.pdf"),
        ("../../etc/passwd", "passwd"),
        ("C:\\Windows\\system.ini", "system.ini"),
        ('inv"oice.pdf', "invoice.pdf"),
        ("with\nnewline.pdf", "withnewline.pdf"),
        ("...", "document.pdf"),
        ("", "document.pdf"),
    ],
)
def test_download_names_are_cleaned(given: str, expected: str) -> None:
    """The name goes in a header, so it must not carry a path or a quote."""
    assert safe_download_name(given) == expected


def test_download_names_are_not_absurdly_long() -> None:
    assert len(safe_download_name("a" * 500 + ".pdf")) <= 200
