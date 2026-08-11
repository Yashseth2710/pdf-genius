"""Registration, sign-in and session endpoints."""

from fastapi import APIRouter, Request, status

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.security import create_access_token
from app.models import User
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UserResponse,
)
from app.schemas.common import SuccessResponse
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id),
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/register",
    response_model=SuccessResponse[AuthResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create an account",
)
# Registration is rate limited so the endpoint cannot be used to create
# accounts in bulk or to probe which addresses are taken.
@limiter.limit("5/minute")
def register(
    request: Request,
    payload: RegisterRequest,
    db: DbSession,
) -> SuccessResponse[AuthResponse]:
    user = AuthService(db).register(payload)
    return SuccessResponse(data=_auth_response(user))


@router.post(
    "/login",
    response_model=SuccessResponse[AuthResponse],
    summary="Sign in and receive an access token",
)
# Tighter than registration: this is the endpoint worth guessing at.
@limiter.limit("10/minute")
def login(
    request: Request,
    payload: LoginRequest,
    db: DbSession,
) -> SuccessResponse[AuthResponse]:
    user = AuthService(db).authenticate(payload)
    return SuccessResponse(data=_auth_response(user))


@router.get(
    "/me",
    response_model=SuccessResponse[UserResponse],
    summary="The signed-in user",
)
def me(current_user: CurrentUser) -> SuccessResponse[UserResponse]:
    return SuccessResponse(data=UserResponse.model_validate(current_user))


@router.post(
    "/logout",
    response_model=SuccessResponse[MessageResponse],
    summary="Sign out",
)
def logout(current_user: CurrentUser) -> SuccessResponse[MessageResponse]:
    """Sign out.

    Access tokens are stateless and short-lived, so there is nothing to delete
    server-side: the client discards the token. The endpoint exists so the
    frontend has one thing to call, and so revocation can be added here later
    without changing the client.
    """
    return SuccessResponse(data=MessageResponse(message="Signed out."))
