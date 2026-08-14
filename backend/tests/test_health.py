"""The health endpoint is what CI and the host use to tell if we are alive."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app import __version__


def test_health_reports_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ok"
    assert body["data"]["version"] == __version__


def test_health_does_not_touch_the_database(client: TestClient) -> None:
    """Liveness must pass even though the test database does not exist."""
    assert client.get("/api/v1/health").status_code == 200


def test_health_says_whether_ai_is_available(client: TestClient) -> None:
    # AI is off by default, and the frontend relies on this flag to hide
    # features rather than letting them fail on click.
    assert client.get("/api/v1/health").json()["data"]["ai_enabled"] is False


def test_every_response_carries_a_request_id(client: TestClient) -> None:
    assert client.get("/api/v1/health").headers["X-Request-ID"]


def test_supplied_request_id_is_echoed_back(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": "abc123"})

    assert response.headers["X-Request-ID"] == "abc123"


def test_readiness_reports_the_database_it_can_reach(client: TestClient) -> None:
    """Readiness is what a host polls before sending traffic, so it has to
    actually try the database rather than assume it."""
    response = client.get("/api/v1/health/ready")

    # The test database URL points at nothing in a unit run, so this is the
    # unavailable branch - which is the one worth checking anyway.
    assert response.status_code in {200, 503}
    body = response.json()["data"]
    assert body["database"] in {"ok", "unavailable"}
    assert body["status"] == ("ok" if body["database"] == "ok" else "degraded")


def test_readiness_says_503_when_the_database_is_unreachable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A host that keeps routing traffic to a backend with no database turns
    one outage into every request failing."""

    def refuse(*_: object, **__: object) -> None:
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr("app.api.v1.health.engine.connect", refuse)

    response = client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json()["data"]["database"] == "unavailable"
    assert response.json()["data"]["status"] == "degraded"


def test_readiness_never_leaks_why_the_database_failed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The connection string lives in the exception this raises."""

    def refuse(*_: object, **__: object) -> None:
        raise OperationalError(
            "SELECT 1",
            {},
            Exception("could not connect to host=db.example user=app password=hunter2"),
        )

    monkeypatch.setattr("app.api.v1.health.engine.connect", refuse)

    body = client.get("/api/v1/health/ready").text

    assert "hunter2" not in body
    assert "db.example" not in body
