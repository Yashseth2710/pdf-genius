"""Settings parsing - mostly guarding the paper cuts that bite in deployment."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def make_settings(**overrides: object) -> Settings:
    """Build settings from explicit values only.

    ``_env_file=None`` keeps the developer's own backend/.env out of the
    assertions, so the suite behaves the same here and on a CI runner.
    """
    values: dict[str, object] = {
        "database_url": "postgresql+psycopg://u:p@host/db",
        "jwt_secret": "secret",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        # Hosts hand out plain URLs; SQLAlchemy would pick psycopg2, which we
        # do not install, so the scheme is rewritten on the way in.
        ("postgresql://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
        ("postgres://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
        ("postgresql+psycopg://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
    ],
)
def test_database_url_always_uses_psycopg3(given: str, expected: str) -> None:
    assert make_settings(database_url=given).database_url == expected


def test_query_string_survives_the_rewrite() -> None:
    """Neon refuses plain-text connections, so sslmode must not be dropped."""
    settings = make_settings(
        database_url="postgresql://u:p@ep-x.aws.neon.tech/neondb?sslmode=require"
    )

    assert settings.database_url.endswith("/neondb?sslmode=require")
    assert settings.database_url.startswith("postgresql+psycopg://")


def test_missing_required_settings_fail_loudly(monkeypatch: pytest.MonkeyPatch) -> None:
    """Better a refusal to boot than a server running without a signing key."""
    monkeypatch.delenv("JWT_SECRET", raising=False)

    with pytest.raises(ValidationError, match="jwt_secret"):
        Settings(_env_file=None, database_url="postgresql://u:p@host/db")


def test_cors_origins_are_split_and_trimmed() -> None:
    settings = make_settings(cors_origins="http://localhost:3000, https://pdf-genius.app ")

    assert settings.cors_origin_list == ["http://localhost:3000", "https://pdf-genius.app"]


def test_upload_limits_are_exposed_in_bytes() -> None:
    settings = make_settings(max_upload_size_mb=25)

    assert settings.max_upload_size_bytes == 26_214_400
    assert "application/pdf" in settings.allowed_upload_type_list


@pytest.mark.parametrize(
    ("provider", "enabled"),
    [("none", False), ("", False), ("disabled", False), ("local", True), ("ollama", True)],
)
def test_ai_is_off_unless_a_provider_is_named(provider: str, enabled: bool) -> None:
    assert make_settings(ai_provider=provider).ai_enabled is enabled
