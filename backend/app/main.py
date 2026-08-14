"""FastAPI application factory and wiring."""

import logging
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.headers import register_security_headers
from app.core.rate_limit import register_rate_limiting

API_PREFIX = "/api/v1"

logger = logging.getLogger("app.request")


def configure_logging(settings: Settings) -> None:
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)-8s %(name)s %(message)s",
    )


def register_request_logging(app: FastAPI) -> None:
    """Tag every request with an id and log how it went (spec section 66).

    Only metadata is recorded - never document contents, passwords or tokens.
    """

    @app.middleware("http")
    async def log_requests(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id

        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started) * 1000

        logger.info(
            "request_id=%s method=%s path=%s status=%d duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        response.headers["X-Request-ID"] = request_id
        return response


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)

    app = FastAPI(
        title="PDF Genius API",
        description="Everything PDF. One simple workspace.",
        version=__version__,
        # Interactive docs are handy in development but are noise - and a map
        # of the API - in production.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    # An explicit origin list, never "*": the browser sends credentials.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Content-Disposition"],
    )

    register_rate_limiting(app)
    # Added after the rate limiter, so it wraps it: Starlette runs the
    # most-recently-added middleware outermost. That ordering is what puts the
    # headers on a 429, which the rate limiter returns without the routes ever
    # being reached.
    register_security_headers(app, settings)
    register_request_logging(app)
    register_exception_handlers(app)
    app.include_router(api_router, prefix=API_PREFIX)

    return app


app = create_app()
