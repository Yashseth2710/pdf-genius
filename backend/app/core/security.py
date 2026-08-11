"""Password hashing and access tokens.

Two responsibilities, both easy to get subtly wrong, so they live here rather
than being scattered across services.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings
from app.core.errors import AuthenticationError

settings = get_settings()

# Argon2id with the library defaults, which follow current OWASP guidance.
# The parameters are recorded inside each hash, so they can be raised later
# without invalidating existing passwords - see needs_rehash.
_hasher = PasswordHasher()

# Not a secret: the claim that distinguishes an access token from any other
# kind of token we might issue later.
TOKEN_TYPE = "access"  # noqa: S105


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Check a password against a stored hash, returning False rather than raising."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """True when a hash was made with weaker parameters than we now use."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return False


def create_access_token(user_id: uuid.UUID, expires_delta: timedelta | None = None) -> str:
    """Issue a signed token identifying a user.

    Includes a unique jti so individual tokens can be revoked later without
    changing how they are issued.
    """
    now = datetime.now(UTC)
    expires = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": TOKEN_TYPE,
        "iat": now,
        "exp": expires,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> uuid.UUID:
    """Return the user id in a valid token, or raise AuthenticationError.

    Every failure - expired, tampered, wrong algorithm, malformed - produces
    the same error, so a caller cannot learn why a token was rejected.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            # Pinned: without this, a token could name its own algorithm and
            # talk us into verifying it differently than we signed it.
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise AuthenticationError("Your session has expired. Please sign in again.") from exc

    if payload.get("type") != TOKEN_TYPE:
        raise AuthenticationError("Your session has expired. Please sign in again.")

    try:
        return uuid.UUID(str(payload["sub"]))
    except (ValueError, KeyError) as exc:
        raise AuthenticationError("Your session has expired. Please sign in again.") from exc
