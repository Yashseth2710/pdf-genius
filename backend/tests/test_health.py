"""The health endpoint is what CI and the host use to tell if we are alive."""

from fastapi.testclient import TestClient

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
