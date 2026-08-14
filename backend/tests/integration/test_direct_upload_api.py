"""The upload path used where the API never sees the file arrive.

On Vercel a function will not accept a request body over 4.5MB, so the browser
writes to object storage itself and then tells the API where it landed. That
removes the API from the middle of an upload — which is exactly why these tests
exist. Every check the streaming path makes while writing has to be made again
against the object that actually turned up, and "the client said it was a small
PDF" is not one of them.

The tests below are mostly the refusals. The happy path is one test; the ways
this could be abused are the rest.
"""

import uuid
from io import BytesIO

import pymupdf
from fastapi.testclient import TestClient

from app.services.storage.local import LocalStorage

TICKET = "/api/v1/documents/upload-ticket"
RECORD = "/api/v1/documents/record"


def make_pdf(pages: int = 1) -> bytes:
    with pymupdf.open() as document:
        for _ in range(pages):
            document.new_page()
        return bytes(document.tobytes())


def user_id(client: TestClient) -> str:
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 200
    return str(response.json()["data"]["id"])


def put(storage: LocalStorage, key: str, data: bytes) -> str:
    """Place an object as though the browser had uploaded it."""
    storage.save(BytesIO(data), key=key, max_bytes=len(data) + 1)
    return key


def test_a_ticket_names_a_key_under_the_asking_user(authed_client: TestClient) -> None:
    response = authed_client.post(TICKET, json={"filename": "report.pdf", "size": 1024})

    assert response.status_code == 200
    key = response.json()["data"]["key"]
    assert key.startswith(f"documents/{user_id(authed_client)}/")
    # The name the user chose is not the name on disk.
    assert "report" not in key


def test_a_ticket_is_refused_for_a_file_over_the_limit(authed_client: TestClient) -> None:
    """Refused before the upload rather than after it, which saves someone
    sending 30MB to be told no."""
    response = authed_client.post(TICKET, json={"filename": "huge.pdf", "size": 999_000_000})

    assert response.status_code == 413
    assert response.json()["success"] is False


def test_a_real_pdf_is_recorded(authed_client: TestClient, storage: LocalStorage) -> None:
    ticket = authed_client.post(TICKET, json={"filename": "report.pdf", "size": 2048}).json()
    key = ticket["data"]["key"]
    put(storage, key, make_pdf(3))

    response = authed_client.post(RECORD, json={"key": key, "filename": "report.pdf"})

    assert response.status_code == 201
    document = response.json()["data"]
    assert document["original_filename"] == "report.pdf"
    assert document["mime_type"] == "application/pdf"
    assert document["page_count"] == 3
    # A recorded file stays where it is.
    assert storage.exists(key)


def test_an_executable_named_pdf_is_refused_and_removed(
    authed_client: TestClient, storage: LocalStorage
) -> None:
    """The check that the streaming path does mid-write, done here against the
    stored bytes. The filename and the client's claimed type are both ignored."""
    ticket = authed_client.post(TICKET, json={"filename": "invoice.pdf", "size": 512}).json()
    key = ticket["data"]["key"]
    put(storage, key, b"MZ\x90\x00" + b"\x00" * 400)

    response = authed_client.post(RECORD, json={"key": key, "filename": "invoice.pdf"})

    assert response.status_code == 415
    # Refusing it is not enough; it must not be left sitting in the store.
    assert not storage.exists(key)


def test_an_empty_object_is_refused_and_removed(
    authed_client: TestClient, storage: LocalStorage
) -> None:
    ticket = authed_client.post(TICKET, json={"filename": "nothing.pdf", "size": 10}).json()
    key = ticket["data"]["key"]
    storage.save(BytesIO(b""), key=key, max_bytes=1)

    response = authed_client.post(RECORD, json={"key": key, "filename": "nothing.pdf"})

    # 422, the app's code for a file that is not usable, rather than 400.
    assert response.status_code == 422
    assert not storage.exists(key)


def test_a_key_belonging_to_someone_else_is_not_found(
    authed_client: TestClient, storage: LocalStorage
) -> None:
    """The one that matters most.

    The caller is signed in, so authentication proves nothing. Without the
    prefix check, naming another account's key would record their document as
    yours - and the file itself would then be downloadable through your list.
    """
    stranger = uuid.uuid4()
    key = put(storage, f"documents/{stranger}/{uuid.uuid4().hex}.pdf", make_pdf())

    response = authed_client.post(RECORD, json={"key": key, "filename": "theirs.pdf"})

    assert response.status_code == 404
    # And refusing must not have deleted it: that would turn this into a way of
    # destroying other people's documents.
    assert storage.exists(key)


def test_a_key_with_no_object_behind_it_is_not_found(authed_client: TestClient) -> None:
    ticket = authed_client.post(TICKET, json={"filename": "ghost.pdf", "size": 100}).json()

    response = authed_client.post(RECORD, json={"key": ticket["data"]["key"], "filename": "g.pdf"})

    assert response.status_code == 404


def test_a_traversing_key_is_refused(authed_client: TestClient) -> None:
    """validate_key is the last line, and it is reached before anything else
    touches the filesystem."""
    response = authed_client.post(RECORD, json={"key": "../../etc/passwd", "filename": "passwd"})

    assert response.status_code in {400, 404, 422}


def test_recording_needs_a_signed_in_user(api_client: TestClient) -> None:
    response = api_client.post(RECORD, json={"key": "documents/x/y.pdf", "filename": "y.pdf"})

    assert response.status_code == 401
