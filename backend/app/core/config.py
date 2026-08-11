"""Application settings, loaded from environment variables (see .env.example)."""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed access to every environment variable the backend needs.

    Values come from the process environment first, then from backend/.env.
    Anything without a default here is mandatory: the app refuses to start
    rather than running with a missing database URL or signing key.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- App ---
    environment: str = "development"
    log_level: str = "INFO"

    # --- Database ---
    database_url: str

    # --- Auth ---
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # --- CORS ---
    cors_origins: str = "http://localhost:3000"

    # --- Storage ---
    storage_provider: str = "local"
    storage_root: Path = Path("./storage")
    max_upload_size_mb: int = 25
    allowed_upload_types: str = "application/pdf,image/jpeg,image/png"

    # --- Retention ---
    output_retention_hours: int = 24

    # --- AI (optional: the PDF tools never depend on it) ---
    ai_provider: str = "none"
    ai_model: str = ""

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, value: str) -> str:
        """Force the psycopg 3 driver.

        Hosting providers hand out plain ``postgresql://`` URLs, which
        SQLAlchemy maps to psycopg2 - a driver we do not install. Rewriting the
        scheme here means a copy-pasted Neon or Render URL just works.
        """
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        """Allowed browser origins. Never a wildcard - credentials are sent."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_upload_type_list(self) -> list[str]:
        """MIME types accepted by the upload endpoint."""
        return [mime.strip() for mime in self.allowed_upload_types.split(",") if mime.strip()]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def ai_enabled(self) -> bool:
        """Whether AI features should be offered at all (spec section 68)."""
        return self.ai_provider.lower() not in {"", "none", "disabled"}


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance, so .env is parsed once per process."""
    return Settings()
