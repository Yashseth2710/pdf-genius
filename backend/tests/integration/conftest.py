"""Fixtures for tests that need a real PostgreSQL database.

They run against TEST_DATABASE_URL and are skipped when it is not set, so the
suite still passes on a machine with no local database. TEST_DATABASE_URL must
never point at a database with real data: the fixtures run migrations and roll
the schema back afterwards.
"""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _psycopg_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """A database with the migrations applied, torn down at the end."""
    raw_url = os.environ.get("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("TEST_DATABASE_URL is not set - skipping integration tests")

    url = _psycopg_url(raw_url)
    alembic_config = Config(str(BACKEND_DIR / "alembic.ini"))
    alembic_config.set_main_option("sqlalchemy.url", url)

    # Building the schema through the migration - rather than
    # metadata.create_all - means these tests also prove the migration works.
    command.upgrade(alembic_config, "head")

    db_engine = create_engine(url)
    try:
        yield db_engine
    finally:
        db_engine.dispose()
        command.downgrade(alembic_config, "base")


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """A session inside a transaction that is always rolled back.

    Tests therefore never see each other's rows and the database is left as it
    was found. ``join_transaction_mode="create_savepoint"`` means code under
    test can call ``commit()`` for real - it commits to a savepoint, and the
    outer rollback still undoes everything.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def api_client(db: Session) -> Iterator[TestClient]:
    """A test client whose requests run in the same rolled-back transaction."""
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    # Limits are per-process and would otherwise leak between tests, so start
    # each test with a clean slate.
    limiter.reset()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
