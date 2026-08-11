"""The auth endpoints, end to end against a real database."""

import uuid
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.repositories.user import UserRepository

REGISTRATION = {
    "email": "ada@example.com",
    "password": "a-good-long-password",
    "first_name": "Ada",
    "last_name": "Lovelace",
}


def register(client: TestClient, **overrides: object) -> dict[str, Any]:
    payload = {**REGISTRATION, **overrides}
    body: dict[str, Any] = client.post("/api/v1/auth/register", json=payload).json()
    return body


def test_registering_creates_an_account_and_signs_the_user_in(
    api_client: TestClient,
) -> None:
    response = api_client.post("/api/v1/auth/register", json=REGISTRATION)

    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    assert body["data"]["token_type"] == "bearer"
    assert body["data"]["access_token"]
    assert body["data"]["user"]["email"] == "ada@example.com"


def test_the_password_never_comes_back(api_client: TestClient) -> None:
    response = api_client.post("/api/v1/auth/register", json=REGISTRATION)

    assert "password" not in response.text
    assert "argon2" not in response.text


def test_the_password_is_stored_hashed(api_client: TestClient, db: Session) -> None:
    api_client.post("/api/v1/auth/register", json=REGISTRATION)

    user = UserRepository(db).get_by_email("ada@example.com")

    assert user is not None
    assert user.password_hash != REGISTRATION["password"]
    assert user.password_hash.startswith("$argon2")


def test_email_case_and_spacing_do_not_create_a_second_account(
    api_client: TestClient,
) -> None:
    api_client.post("/api/v1/auth/register", json=REGISTRATION)

    duplicate = api_client.post(
        "/api/v1/auth/register",
        json={**REGISTRATION, "email": "  ADA@Example.COM  "},
    )

    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"


def test_registration_rejects_a_short_password(api_client: TestClient) -> None:
    response = api_client.post("/api/v1/auth/register", json={**REGISTRATION, "password": "short"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_registration_rejects_a_malformed_email(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/v1/auth/register", json={**REGISTRATION, "email": "not-an-email"}
    )

    assert response.status_code == 422


def test_registration_rejects_a_blank_name(api_client: TestClient) -> None:
    response = api_client.post("/api/v1/auth/register", json={**REGISTRATION, "first_name": "   "})

    assert response.status_code == 422


def test_signing_in_with_the_right_password_works(api_client: TestClient) -> None:
    api_client.post("/api/v1/auth/register", json=REGISTRATION)

    response = api_client.post(
        "/api/v1/auth/login",
        json={"email": "ada@example.com", "password": REGISTRATION["password"]},
    )

    assert response.status_code == 200
    assert response.json()["data"]["access_token"]


def test_signing_in_is_not_case_sensitive_about_the_email(api_client: TestClient) -> None:
    api_client.post("/api/v1/auth/register", json=REGISTRATION)

    response = api_client.post(
        "/api/v1/auth/login",
        json={"email": "ADA@EXAMPLE.COM", "password": REGISTRATION["password"]},
    )

    assert response.status_code == 200


def test_a_wrong_password_is_refused(api_client: TestClient) -> None:
    api_client.post("/api/v1/auth/register", json=REGISTRATION)

    response = api_client.post(
        "/api/v1/auth/login",
        json={"email": "ada@example.com", "password": "not-the-password"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_does_not_reveal_whether_an_account_exists(api_client: TestClient) -> None:
    """Both failures must be indistinguishable, or the endpoint becomes a
    way to test which email addresses are registered."""
    api_client.post("/api/v1/auth/register", json=REGISTRATION)

    wrong_password = api_client.post(
        "/api/v1/auth/login",
        json={"email": "ada@example.com", "password": "not-the-password"},
    )
    unknown_user = api_client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "not-the-password"},
    )

    assert wrong_password.status_code == unknown_user.status_code
    assert wrong_password.json() == unknown_user.json()


def test_me_returns_the_signed_in_user(api_client: TestClient) -> None:
    token = register(api_client)["data"]["access_token"]

    response = api_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["data"]["email"] == "ada@example.com"


def test_me_refuses_a_request_with_no_token(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["success"] is False


def test_me_refuses_a_forged_token(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/auth/me", headers={"Authorization": "Bearer made.up.token"})

    assert response.status_code == 401


def test_a_token_for_a_deleted_user_stops_working(api_client: TestClient, db: Session) -> None:
    token = register(api_client)["data"]["access_token"]
    user = UserRepository(db).get_by_email("ada@example.com")
    assert user is not None
    db.delete(user)
    db.commit()

    response = api_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_a_token_naming_a_user_who_never_existed_is_refused(
    api_client: TestClient,
) -> None:
    token = create_access_token(uuid.uuid4())

    response = api_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_logout_requires_a_session(api_client: TestClient) -> None:
    assert api_client.post("/api/v1/auth/logout").status_code == 401


def test_logout_succeeds_for_a_signed_in_user(api_client: TestClient) -> None:
    token = register(api_client)["data"]["access_token"]

    response = api_client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_repeated_failed_logins_are_rate_limited(api_client: TestClient) -> None:
    api_client.post("/api/v1/auth/register", json=REGISTRATION)
    attempt = {"email": "ada@example.com", "password": "wrong"}

    statuses = [api_client.post("/api/v1/auth/login", json=attempt).status_code for _ in range(12)]

    assert 429 in statuses
    limited = api_client.post("/api/v1/auth/login", json=attempt)
    assert limited.json()["error"]["code"] == "RATE_LIMITED"
