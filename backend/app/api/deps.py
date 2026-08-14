"""Shared FastAPI dependencies."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import AuthenticationError
from app.core.security import decode_access_token
from app.models import User
from app.services.auth import AuthService
from app.services.storage import LocalStorage, Storage, VercelBlobStorage

# auto_error=False so a missing header raises our own error, in our own
# envelope, rather than FastAPI's default JSON shape.
bearer_scheme = HTTPBearer(auto_error=False, description="Bearer <access token>")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User:
    """Resolve the signed-in user, or refuse the request.

    Every protected route depends on this. A token that decodes but names a
    user who has since been deleted is treated as invalid, not as a 404.
    """
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("You need to sign in to do that.")

    user_id = decode_access_token(credentials.credentials)

    user = AuthService(db).get_user(user_id)
    if user is None:
        raise AuthenticationError("Your session has expired. Please sign in again.")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@lru_cache
def get_storage() -> Storage:
    """The storage backend named by STORAGE_PROVIDER.

    Local disk in development, Vercel Blob in production - a serverless
    function has no persistent disk, so `local` there would lose every
    document the moment the instance recycled.

    Cached because the blob provider holds an HTTP client, and building one per
    request would pay a TLS handshake per request.
    """
    settings = get_settings()
    provider = settings.storage_provider.lower()

    if provider == "local":
        return LocalStorage(settings.storage_root)
    if provider == "blob":
        return VercelBlobStorage(settings.blob_read_write_token)

    raise ValueError(f"Unknown STORAGE_PROVIDER: {settings.storage_provider!r}")


StorageDep = Annotated[Storage, Depends(get_storage)]
