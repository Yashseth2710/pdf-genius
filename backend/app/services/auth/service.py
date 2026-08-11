"""Registration and sign-in."""

import logging
import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AuthenticationError, ConflictError
from app.core.security import hash_password, needs_rehash, verify_password
from app.models import User
from app.repositories.user import UserRepository, normalise_email
from app.schemas.auth import LoginRequest, RegisterRequest

logger = logging.getLogger(__name__)

# Shown for both a wrong password and an unknown address, so the response
# cannot be used to work out which email addresses have accounts.
INVALID_CREDENTIALS = "Incorrect email or password."

# Verified against when no user matches, purely so that a failed sign-in takes
# about as long either way. Without it, the difference between "no such user"
# (fast) and "wrong password" (a deliberately slow hash) is measurable.
_DUMMY_HASH = hash_password("a-password-that-is-never-valid")


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)

    def register(self, data: RegisterRequest) -> User:
        email = normalise_email(data.email)

        if self.users.email_exists(email):
            raise ConflictError(
                "An account with this email already exists.",
                code="EMAIL_ALREADY_REGISTERED",
            )

        user = User(
            email=email,
            password_hash=hash_password(data.password),
            first_name=data.first_name.strip(),
            last_name=data.last_name.strip(),
        )
        try:
            self.users.add(user)
            self.db.commit()
        except IntegrityError as exc:
            # Two registrations for the same address can race past the check
            # above; the unique index is what actually decides it.
            self.db.rollback()
            raise ConflictError(
                "An account with this email already exists.",
                code="EMAIL_ALREADY_REGISTERED",
            ) from exc

        logger.info("Registered user id=%s", user.id)
        return user

    def authenticate(self, data: LoginRequest) -> User:
        user = self.users.get_by_email(data.email)

        if user is None:
            # Spend the same effort as a real check before failing.
            verify_password(data.password, _DUMMY_HASH)
            raise AuthenticationError(INVALID_CREDENTIALS, code="INVALID_CREDENTIALS")

        if not verify_password(data.password, user.password_hash):
            raise AuthenticationError(INVALID_CREDENTIALS, code="INVALID_CREDENTIALS")

        # Transparently upgrade the stored hash if the cost parameters have
        # been raised since this password was set.
        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(data.password)
            self.db.commit()

        return user

    def get_user(self, user_id: uuid.UUID) -> User | None:
        return self.users.get(user_id)
