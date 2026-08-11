"""Health endpoints: one for "is the process up", one for "can it serve"."""

import logging

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import __version__
from app.core.config import get_settings
from app.core.database import engine
from app.schemas.common import SuccessResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])
settings = get_settings()


class HealthStatus(BaseModel):
    status: str
    version: str
    environment: str
    ai_enabled: bool


class ReadinessStatus(BaseModel):
    status: str
    database: str


@router.get("/health", response_model=SuccessResponse[HealthStatus])
def health() -> SuccessResponse[HealthStatus]:
    """Liveness. Deliberately touches nothing external, so it never flaps."""
    return SuccessResponse(
        data=HealthStatus(
            status="ok",
            version=__version__,
            environment=settings.environment,
            # Surfaced so the frontend can hide AI features instead of
            # letting a user click something that cannot work (section 68).
            ai_enabled=settings.ai_enabled,
        )
    )


@router.get("/health/ready", response_model=SuccessResponse[ReadinessStatus])
def readiness(response: Response) -> SuccessResponse[ReadinessStatus]:
    """Readiness. Confirms the database answers before we call ourselves up.

    Defined with ``def`` rather than ``async def`` on purpose: the query is
    blocking, so FastAPI runs it in a worker thread instead of stalling the
    event loop.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        database = "ok"
    except SQLAlchemyError as exc:
        logger.warning("Readiness check failed: %s", exc.__class__.__name__)
        database = "unavailable"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return SuccessResponse(
        data=ReadinessStatus(
            status="ok" if database == "ok" else "degraded",
            database=database,
        )
    )
