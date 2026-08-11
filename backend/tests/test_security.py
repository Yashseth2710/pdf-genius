"""Password hashing and token handling - no database involved."""

import uuid
from datetime import timedelta

import jwt
import pytest

from app.core.config import get_settings
from app.core.errors import AuthenticationError
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

settings = get_settings()


def test_hashing_never_stores_the_password() -> None:
    password = "correct horse battery staple"

    stored = hash_password(password)

    assert password not in stored
    assert stored.startswith("$argon2")


def test_the_same_password_hashes_differently_each_time() -> None:
    """Argon2 salts every hash, so identical passwords must not look identical."""
    assert hash_password("same-password") != hash_password("same-password")


def test_verify_accepts_the_right_password_and_rejects_others() -> None:
    stored = hash_password("s3cret-password")

    assert verify_password("s3cret-password", stored) is True
    assert verify_password("wrong-password", stored) is False


def test_verify_returns_false_for_a_corrupt_hash() -> None:
    """Garbage in the column must not blow up the login endpoint."""
    assert verify_password("anything", "not-a-hash") is False


def test_a_token_round_trips_to_the_user_it_names() -> None:
    user_id = uuid.uuid4()

    assert decode_access_token(create_access_token(user_id)) == user_id


def test_an_expired_token_is_refused() -> None:
    token = create_access_token(uuid.uuid4(), expires_delta=timedelta(seconds=-1))

    with pytest.raises(AuthenticationError):
        decode_access_token(token)


def test_a_tampered_token_is_refused() -> None:
    token = create_access_token(uuid.uuid4())
    header, payload, signature = token.split(".")

    with pytest.raises(AuthenticationError):
        decode_access_token(f"{header}.{payload}xyz.{signature}")


def test_a_token_signed_with_another_key_is_refused() -> None:
    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "exp": 9_999_999_999},
        "the-wrong-secret",
        algorithm="HS256",
    )

    with pytest.raises(AuthenticationError):
        decode_access_token(forged)


def test_an_unsigned_token_is_refused() -> None:
    """The classic alg=none attack: a token that asks to skip verification."""
    unsigned = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "exp": 9_999_999_999},
        key="",
        algorithm="none",
    )

    with pytest.raises(AuthenticationError):
        decode_access_token(unsigned)


def test_a_token_of_the_wrong_type_is_refused() -> None:
    """Guards against a future refresh token being accepted as an access token."""
    other = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "refresh", "exp": 9_999_999_999},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

    with pytest.raises(AuthenticationError):
        decode_access_token(other)


def test_rubbish_is_refused() -> None:
    for value in ("", "not.a.token", "abc"):
        with pytest.raises(AuthenticationError):
            decode_access_token(value)


def test_failures_all_say_the_same_thing() -> None:
    """The reason a token was rejected is not the caller's business."""
    expired = create_access_token(uuid.uuid4(), expires_delta=timedelta(seconds=-1))
    messages = set()

    for token in (expired, "rubbish"):
        try:
            decode_access_token(token)
        except AuthenticationError as exc:
            messages.add(exc.message)

    assert len(messages) == 1
