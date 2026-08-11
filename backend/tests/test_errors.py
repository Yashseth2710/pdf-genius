"""Failures must always come back in the same envelope (spec section 47)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import (
    AppError,
    InvalidFileError,
    NotFoundError,
    PermissionDeniedError,
    register_exception_handlers,
)


@pytest.fixture(scope="module")
def error_client() -> TestClient:
    """A throwaway app whose routes do nothing but raise."""
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/boom/app-error")
    def _app_error() -> None:
        raise InvalidFileError("The uploaded file is not a valid PDF.")

    @app.get("/boom/forbidden")
    def _forbidden() -> None:
        raise PermissionDeniedError

    @app.get("/boom/crash")
    def _crash() -> None:
        raise RuntimeError("connection string postgres://user:hunter2@db/prod")

    return TestClient(app, raise_server_exceptions=False)


def test_app_error_uses_its_code_and_message(error_client: TestClient) -> None:
    response = error_client.get("/boom/app-error")

    assert response.status_code == 422
    assert response.json() == {
        "success": False,
        "error": {
            "code": "INVALID_FILE",
            "message": "The uploaded file is not a valid PDF.",
        },
    }


def test_permission_denied_returns_403(error_client: TestClient) -> None:
    response = error_client.get("/boom/forbidden")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_unexpected_crash_never_leaks_internals(error_client: TestClient) -> None:
    """A stack trace or a connection string must not reach the client."""
    response = error_client.get("/boom/crash")

    assert response.status_code == 500
    body = response.json()
    assert body == {
        "success": False,
        "error": {"code": "INTERNAL_ERROR", "message": "Something went wrong on our side."},
    }
    assert "hunter2" not in response.text
    assert "Traceback" not in response.text


def test_unknown_route_returns_the_error_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json()["success"] is False
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_app_error_message_can_be_overridden() -> None:
    assert NotFoundError("No such document.").message == "No such document."
    assert AppError().code == "BAD_REQUEST"
