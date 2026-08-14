"""Security headers reach every response, not just the successful ones."""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.headers import CONTENT_SECURITY_POLICY, HSTS_MAX_AGE, register_security_headers
from app.main import create_app


def build_settings(**overrides: object) -> Settings:
    """Settings from explicit values only, so the developer's own .env cannot
    change what these tests assert."""
    values: dict[str, object] = {
        "database_url": "postgresql+psycopg://u:p@host/db",
        "jwt_secret": "secret",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


def build_client(**overrides: object) -> TestClient:
    """A minimal app carrying only the middleware under test.

    Deliberately not the real application: this isolates the headers from
    routing, auth and the rate limiter, so a failure here means the middleware
    is wrong rather than something upstream of it.
    """
    app = FastAPI()
    register_security_headers(app, build_settings(**overrides))

    @app.get("/fine")
    async def fine() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/broken")
    async def broken() -> dict[str, bool]:
        raise HTTPException(status_code=418, detail="no")

    return TestClient(app)


def test_every_security_header_is_present() -> None:
    headers = build_client().get("/fine").headers

    assert headers["Content-Security-Policy"] == CONTENT_SECURITY_POLICY
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert headers["Cross-Origin-Opener-Policy"] == "same-origin"
    assert headers["Cross-Origin-Resource-Policy"] == "same-site"
    assert "camera=()" in headers["Permissions-Policy"]


def test_the_policy_allows_nothing() -> None:
    """An API that serves no HTML should permit no HTML behaviour at all."""
    policy = build_client().get("/fine").headers["Content-Security-Policy"]

    for directive in ("default-src 'none'", "frame-ancestors 'none'", "form-action 'none'"):
        assert directive in policy


@pytest.mark.parametrize("path", ["/broken", "/no-such-path"])
def test_headers_survive_a_response_no_route_returned(path: str) -> None:
    """Errors are exactly the responses someone probing the API will read, and
    they are produced by handlers the routes never touch."""
    response = build_client().get(path)

    assert response.status_code in {404, 418}
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Content-Security-Policy"] == CONTENT_SECURITY_POLICY


def test_hsts_is_absent_outside_production() -> None:
    """Sending it in development would pin localhost to HTTPS for a year, in
    the developer's own browser, with no way to take it back."""
    assert (
        "Strict-Transport-Security"
        not in build_client(environment="development").get("/fine").headers
    )


def test_hsts_is_sent_in_production() -> None:
    header = (
        build_client(environment="production").get("/fine").headers["Strict-Transport-Security"]
    )

    assert f"max-age={HSTS_MAX_AGE}" in header
    assert "includeSubDomains" in header


def test_the_real_application_is_actually_wired_up() -> None:
    """The tests above prove the middleware works; this one proves it is on."""
    headers = TestClient(create_app()).get("/api/v1/health").headers

    assert headers["Content-Security-Policy"] == CONTENT_SECURITY_POLICY
    assert headers["X-Frame-Options"] == "DENY"


def test_the_docs_page_may_load_its_own_assets() -> None:
    """A blank docs page from a 200 response is the bug this prevents.

    `default-src 'none'` is right for an API that serves JSON, and wrong for
    the one HTML page FastAPI serves itself: Swagger UI fetches its script and
    stylesheet from a CDN, and the strict policy blocks both. The page loads,
    renders nothing, and reports no error anywhere the developer is looking.
    """
    headers = TestClient(create_app()).get("/docs").headers
    policy = headers["Content-Security-Policy"]

    assert "https://cdn.jsdelivr.net" in policy
    assert "script-src" in policy
    assert "style-src" in policy
    # Relaxed, not abandoned: still nothing by default, still unframeable.
    assert policy.startswith("default-src 'none'")
    assert "frame-ancestors 'none'" in policy


def test_relaxing_the_policy_applies_to_the_docs_alone() -> None:
    """The exception is one page, not a hole in the API's policy."""
    headers = TestClient(create_app()).get("/api/v1/health").headers

    assert headers["Content-Security-Policy"] == CONTENT_SECURITY_POLICY
    assert "jsdelivr" not in headers["Content-Security-Policy"]


def test_production_never_relaxes_it() -> None:
    """The docs routes do not exist in production, so the CDN allowance must
    not be reachable there either - a 404 is still a response with headers."""
    client = build_client(environment="production")

    assert client.get("/docs").headers["Content-Security-Policy"] == CONTENT_SECURITY_POLICY
