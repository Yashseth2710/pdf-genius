"""Request and response shapes for the auth endpoints."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# Eight characters is the floor. There is no upper-case/symbol rule: length
# beats composition, and fussy rules push people towards Password1!
Password = Annotated[str, Field(min_length=8, max_length=128)]
Name = Annotated[str, Field(min_length=1, max_length=100)]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: Password
    first_name: Name
    last_name: Name

    @field_validator("first_name", "last_name")
    @classmethod
    def _not_only_whitespace(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @field_validator("password")
    @classmethod
    def _not_only_whitespace_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """A user as the API describes them - never including the password hash."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    first_name: str
    last_name: str
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105  # the scheme name, not a secret
    # Seconds, so the frontend can refresh or warn before the session dies.
    expires_in: int
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
