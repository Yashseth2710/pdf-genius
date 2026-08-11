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
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

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
    was found.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
