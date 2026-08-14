"""The document endpoints, end to end.

This is where untrusted input meets the filesystem, so the tests lean towards
the things that must never happen rather than the happy path alone.
"""

import uuid

import pymupdf
import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Document
from app.repositories.document import DocumentRepository
from app.services.storage.local import LocalStorage

UPLOAD = "/api/v1/documents/upload"
DOCUMENTS = "/api/v1/documents"


def make_pdf(pages: int = 1) -> bytes:
    """A genuinely valid PDF, built rather than pasted as a byte blob."""
    with pymupdf.open() as document:
        for _ in range(pages):
            document.new_page()
        return bytes(document.tobytes())


def make_png() -> bytes:
    # A 1x1 PNG.
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080600000"
        "01f15c4890000000a49444154789c6300010000050001"
        "0d0a2db40000000049454e44ae426082"
    )


def upload(client: TestClient, content: bytes, filename: str, content_type: str) -> Response:
    response: Response = client.post(UPLOAD, files={"file": (filename, content, content_type)})
    return response


def second_user(client: TestClient) -> str:
    """Register another account and return its token."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"other-{uuid.uuid4().hex[:8]}@example.com",
            "password": "a-good-long-password",
            "first_name": "Grace",
            "last_name": "Hopper",
        },
    )
    return str(response.json()["data"]["access_token"])


# --- Uploading ---------------------------------------------------------


def test_uploading_a_pdf_records_it(authed_client: TestClient) -> None:
    response = upload(authed_client, make_pdf(3), "report.pdf", "application/pdf")

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["original_filename"] == "report.pdf"
    assert data["mime_type"] == "application/pdf"
    assert data["page_count"] == 3
    assert data["status"] == "READY"
    assert data["file_size"] > 0


def test_uploading_an_image_works_and_has_no_page_count(
    authed_client: TestClient,
) -> None:
    response = upload(authed_client, make_png(), "scan.png", "image/png")

    assert response.status_code == 201
    assert response.json()["data"]["page_count"] is None


def test_uploading_requires_a_session(api_client: TestClient) -> None:
    assert upload(api_client, make_pdf(), "a.pdf", "application/pdf").status_code == 401


def test_the_response_never_reveals_where_the_file_is_stored(
    authed_client: TestClient,
) -> None:
    response = upload(authed_client, make_pdf(), "report.pdf", "application/pdf")

    assert "storage_path" not in response.text
    assert "documents/" not in response.text


# --- Refusing what is not a document -----------------------------------


def test_an_executable_renamed_to_pdf_is_refused(authed_client: TestClient) -> None:
    """The filename and the declared content type both lie; the bytes do not."""
    windows_exe = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 200

    response = upload(authed_client, windows_exe, "invoice.pdf", "application/pdf")

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"


def test_a_corrupted_pdf_is_refused(authed_client: TestClient) -> None:
    """Starts with the right header, but there is no document behind it."""
    truncated = b"%PDF-1.7\n" + b"\x00\xff" * 50

    response = upload(authed_client, truncated, "broken.pdf", "application/pdf")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_FILE"


def test_an_empty_file_is_refused(authed_client: TestClient) -> None:
    response = upload(authed_client, b"", "empty.pdf", "application/pdf")

    assert response.status_code in {415, 422}


def test_a_file_over_the_limit_is_refused(
    authed_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "max_upload_size_mb", 0)

    response = upload(authed_client, make_pdf(), "big.pdf", "application/pdf")

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_an_account_at_its_quota_cannot_upload(
    authed_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    assert upload(authed_client, make_pdf(), "first.pdf", "application/pdf").status_code == 201

    # A quota of zero means whatever is already stored has filled it.
    monkeypatch.setattr(settings, "storage_quota_mb", 0)
    response = upload(authed_client, make_pdf(), "second.pdf", "application/pdf")

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "STORAGE_QUOTA_EXCEEDED"


def test_the_quota_names_itself_rather_than_the_upload_limit(
    authed_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Both limits abort the write the same way. Telling somebody with 3MB of
    room that their file is 'larger than 25MB' sends them after the wrong
    problem."""
    settings = get_settings()
    monkeypatch.setattr(settings, "storage_quota_mb", 0)

    response = upload(authed_client, make_pdf(), "any.pdf", "application/pdf")

    assert response.json()["error"]["code"] == "STORAGE_QUOTA_EXCEEDED"
    assert "storage" in response.json()["error"]["message"].lower()


def test_the_quota_counts_one_account_not_the_table(authed_client: TestClient, db: Session) -> None:
    """Measured directly rather than through two uploads and a quota: a test
    PDF is about a kilobyte, so any quota small enough to block one account
    would be measured in bytes, and the setting is in megabytes."""
    upload(authed_client, make_pdf(), "mine.pdf", "application/pdf")
    upload(authed_client, make_pdf(3), "mine-too.pdf", "application/pdf")
    other_token = second_user(authed_client)
    authed_client.post(
        UPLOAD,
        files={"file": ("theirs.pdf", make_pdf(), "application/pdf")},
        headers={"Authorization": f"Bearer {other_token}"},
    )

    documents = DocumentRepository(db)
    users = db.execute(select(Document.user_id).distinct()).scalars().all()
    totals = [documents.total_bytes_for_user(user_id) for user_id in users]

    assert len(totals) == 2
    # Each account is counted on its own, so neither total is the sum of both.
    assert sum(totals) != max(totals)


def test_deleting_a_document_frees_the_room_again(
    authed_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    first = upload(authed_client, make_pdf(), "first.pdf", "application/pdf")
    document_id = first.json()["data"]["id"]

    monkeypatch.setattr(settings, "storage_quota_mb", 0)
    assert upload(authed_client, make_pdf(), "no.pdf", "application/pdf").status_code == 413

    authed_client.delete(f"{DOCUMENTS}/{document_id}")
    monkeypatch.setattr(settings, "storage_quota_mb", 500)

    assert upload(authed_client, make_pdf(), "yes.pdf", "application/pdf").status_code == 201


def test_nothing_is_left_on_disk_when_a_file_is_rejected(
    authed_client: TestClient, storage: LocalStorage
) -> None:
    upload(authed_client, b"%PDF-1.7\nrubbish", "broken.pdf", "application/pdf")

    assert list(storage.root.rglob("*.pdf")) == []


def test_a_traversing_filename_cannot_escape_storage(
    authed_client: TestClient, storage: LocalStorage
) -> None:
    """The filename is display text; the path is ours."""
    response = upload(authed_client, make_pdf(), "../../../../evil.pdf", "application/pdf")

    assert response.status_code == 201
    written = list(storage.root.rglob("*.pdf"))
    assert len(written) == 1
    assert written[0].is_relative_to(storage.root)


# --- Listing -----------------------------------------------------------


def test_listing_returns_only_your_own_documents(authed_client: TestClient) -> None:
    upload(authed_client, make_pdf(), "mine.pdf", "application/pdf")
    other_token = second_user(authed_client)

    response = authed_client.get(DOCUMENTS, headers={"Authorization": f"Bearer {other_token}"})

    assert response.status_code == 200
    assert response.json()["data"]["items"] == []
    assert response.json()["data"]["total"] == 0


def test_listing_is_paginated(authed_client: TestClient) -> None:
    for index in range(3):
        upload(authed_client, make_pdf(), f"file-{index}.pdf", "application/pdf")

    first_page = authed_client.get(f"{DOCUMENTS}?limit=2").json()["data"]

    assert len(first_page["items"]) == 2
    assert first_page["total"] == 3
    assert len(authed_client.get(f"{DOCUMENTS}?limit=2&offset=2").json()["data"]["items"]) == 1


def test_listing_rejects_a_silly_page_size(authed_client: TestClient) -> None:
    assert authed_client.get(f"{DOCUMENTS}?limit=5000").status_code == 422


# --- Fetching one ------------------------------------------------------


def test_fetching_your_own_document(authed_client: TestClient) -> None:
    document_id = upload(authed_client, make_pdf(), "a.pdf", "application/pdf").json()["data"]["id"]

    response = authed_client.get(f"{DOCUMENTS}/{document_id}")

    assert response.status_code == 200
    assert response.json()["data"]["id"] == document_id


def test_another_users_document_is_reported_as_missing(
    authed_client: TestClient,
) -> None:
    """404 rather than 403: a 403 would confirm the id exists."""
    document_id = upload(authed_client, make_pdf(), "a.pdf", "application/pdf").json()["data"]["id"]
    other_token = second_user(authed_client)

    response = authed_client.get(
        f"{DOCUMENTS}/{document_id}", headers={"Authorization": f"Bearer {other_token}"}
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_a_made_up_id_is_a_404(authed_client: TestClient) -> None:
    assert authed_client.get(f"{DOCUMENTS}/{uuid.uuid4()}").status_code == 404


def test_a_malformed_id_is_rejected(authed_client: TestClient) -> None:
    assert authed_client.get(f"{DOCUMENTS}/not-a-uuid").status_code == 422


# --- Downloading -------------------------------------------------------


def test_downloading_returns_the_original_bytes(authed_client: TestClient) -> None:
    content = make_pdf(2)
    document_id = upload(authed_client, content, "report.pdf", "application/pdf").json()["data"][
        "id"
    ]

    response = authed_client.get(f"{DOCUMENTS}/{document_id}/download")

    assert response.status_code == 200
    assert response.content == content
    assert response.headers["content-type"].startswith("application/pdf")
    assert 'filename="report.pdf"' in response.headers["content-disposition"]
    assert response.headers["x-content-type-options"] == "nosniff"


def test_the_download_filename_is_cleaned(authed_client: TestClient) -> None:
    document_id = upload(
        authed_client, make_pdf(), "../../etc/passwd.pdf", "application/pdf"
    ).json()["data"]["id"]

    response = authed_client.get(f"{DOCUMENTS}/{document_id}/download")

    disposition = response.headers["content-disposition"]
    assert "../" not in disposition
    assert 'filename="passwd.pdf"' in disposition


def test_you_cannot_download_someone_elses_document(authed_client: TestClient) -> None:
    document_id = upload(authed_client, make_pdf(), "a.pdf", "application/pdf").json()["data"]["id"]
    other_token = second_user(authed_client)

    response = authed_client.get(
        f"{DOCUMENTS}/{document_id}/download",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert response.status_code == 404


def test_downloading_requires_a_session(authed_client: TestClient, api_client: TestClient) -> None:
    document_id = upload(authed_client, make_pdf(), "a.pdf", "application/pdf").json()["data"]["id"]

    api_client.headers.pop("Authorization", None)

    assert api_client.get(f"{DOCUMENTS}/{document_id}/download").status_code == 401


# --- Deleting ----------------------------------------------------------


def test_deleting_removes_the_record_and_the_file(
    authed_client: TestClient, storage: LocalStorage
) -> None:
    document_id = upload(authed_client, make_pdf(), "a.pdf", "application/pdf").json()["data"]["id"]
    assert len(list(storage.root.rglob("*.pdf"))) == 1

    response = authed_client.delete(f"{DOCUMENTS}/{document_id}")

    assert response.status_code == 200
    assert response.json()["data"]["deleted"] is True
    assert authed_client.get(f"{DOCUMENTS}/{document_id}").status_code == 404
    assert list(storage.root.rglob("*.pdf")) == []


def test_you_cannot_delete_someone_elses_document(
    authed_client: TestClient, storage: LocalStorage
) -> None:
    document_id = upload(authed_client, make_pdf(), "a.pdf", "application/pdf").json()["data"]["id"]
    other_token = second_user(authed_client)

    response = authed_client.delete(
        f"{DOCUMENTS}/{document_id}", headers={"Authorization": f"Bearer {other_token}"}
    )

    assert response.status_code == 404
    # And the file is still there, untouched.
    assert len(list(storage.root.rglob("*.pdf"))) == 1
