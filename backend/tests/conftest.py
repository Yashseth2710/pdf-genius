"""Shared test fixtures.

The environment is populated before anything under ``app`` is imported, so the
suite runs on a machine (or a CI runner) with no .env file present. Nothing
here touches a real database.
"""

import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/pdf_genius_test")
os.environ.setdefault("JWT_SECRET", "test-secret-not-used-outside-tests")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(scope="session")
def client() -> TestClient:
    """A test client bound to a freshly built app instance."""
    return TestClient(create_app())
