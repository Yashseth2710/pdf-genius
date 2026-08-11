"""Rate limiting for the endpoints worth attacking.

In-memory counters, per process. That is deliberate: a single backend process
needs no shared store, and adding Redis purely to count requests would break
the free-first constraint (spec sections 52 and 67). If the backend is ever
scaled to several processes, the limits become per-process and this should be
revisited.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.core.errors import error_body

limiter = Limiter(key_func=get_remote_address, default_limits=[])


def register_rate_limiting(app: FastAPI) -> None:
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

    @app.exception_handler(RateLimitExceeded)
    async def handle_rate_limit(_: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content=error_body(
                "RATE_LIMITED",
                "Too many attempts. Please wait a moment and try again.",
            ),
        )
