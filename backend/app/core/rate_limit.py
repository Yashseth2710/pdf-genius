"""Rate limiting for the endpoints worth attacking.

In-memory counters when there is one process, which is the right answer for a
single backend and keeps the free-first constraint (spec sections 52 and 67).

That stops being true on serverless. Vercel runs many instances and recycles
them constantly, so per-process counters mean the limit is really "N attempts
per instance, until that instance goes away" - which is not a limit. Setting
REDIS_URL moves the counters to a store every instance shares, and the limits
mean again what they say.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.errors import error_body

# "memory://" is slowapi's own default and is what development uses.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    storage_uri=get_settings().redis_url or "memory://",
)


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
