"""Application settings loaded from environment variables."""
import os
from pathlib import Path
from typing import Optional

from pydantic import AliasChoices, Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.model_name import DEFAULT_VISION

PROJECT_ROOT = Path(__file__).parent.parent


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "sqlite+aiosqlite:///./app.db"
    
    # API (Railway sets PORT; local dev may use API_PORT)
    api_host: str = "0.0.0.0"
    api_port: int = Field(
        default=8000,
        validation_alias=AliasChoices("PORT", "API_PORT"),
    )

    # OpenRouter (optional, for future use)
    openrouter_api_key: str = ""
    
    # Langfuse Observability (optional)
    langfuse_enabled: bool = False
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_base_url: str = "https://cloud.langfuse.com"
    
    # Vector Database (optional)
    vector_db_api_key: str = ""
    vector_db_url: str = ""
    vector_db_index_name: str = ""
    vector_db_environment: str = ""
    
    # Logging
    log_level: str = "INFO"
    
    # Application
    app_name: str = "Scribely"
    app_version: str = "0.1.0"
    debug: bool = False

    # Redis (optional)
    redis_url: Optional[str] = None
    redis_enabled: bool = False
    redis_ttl_seconds: int = 86400

    # Clerk Authentication
    clerk_secret_key: str = ""
    clerk_publishable_key: Optional[str] = None
    # JWKS URL for JWT verification. If unset, derived from clerk_publishable_key.
    clerk_jwks_url: Optional[str] = None

    # S3-compatible object storage (MinIO, R2, S3) — optional mirror for meeting files
    object_storage_enabled: bool = False
    s3_endpoint_url: Optional[str] = None
    s3_bucket: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_region: str = "us-east-1"
    s3_use_path_style: bool = True

    # File uploads
    upload_dir: str = "./uploads"
    # Max upload sizes in bytes (defaults: 1024 video, 16MB transcript)
    max_video_size_bytes: int = 1024 * 1024 * 1024
    max_transcript_size_bytes: int = 16 * 1024 * 1024

    # Diarization & speaker attribution
    deepgram_api_key: str = ""
    assemblyai_api_key: str = ""
    diarization_provider: str = "deepgram"  # "deepgram" or "assemblyai"
    speaker_id_vision_model: str = DEFAULT_VISION
    frames_per_speaker: int = 10

    # CORS
    # Comma-separated list of allowed origins.
    # Defaults cover local development and known production domains.
    # On Railway, set the CORS_ORIGINS environment variable to extend or
    # override this list, e.g.:
    #   CORS_ORIGINS=http://localhost:3000,https://frontend.railway.internal,https://your-app.up.railway.app
    cors_origins: str = (
        "http://localhost:3000,"
        "http://127.0.0.1:3000,"
        "http://localhost:8000,"
        "https://www.scribely.xyz,"
        "https://scribely.xyz,"
        # Railway internal service-to-service DNS (http — internal traffic is unencrypted)
        "http://frontend.railway.internal,"
        # Railway public domain — set RAILWAY_PUBLIC_DOMAIN or override CORS_ORIGINS
        # with the actual value assigned to the Frontend service.
        "https://frontend.up.railway.app"
    )
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = ["*"]
    cors_allow_headers: list[str] = ["*"]

    @computed_field
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS_ORIGINS string into a deduplicated list."""
        return list(dict.fromkeys(
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ))


def _sync_langfuse_sdk_environment(s: Settings) -> None:
    """Langfuse SDK reads LANGFUSE_* from os.environ; pydantic-settings only loads .env into Settings."""
    if not s.langfuse_enabled:
        return
    if s.langfuse_public_key:
        os.environ["LANGFUSE_PUBLIC_KEY"] = s.langfuse_public_key
    if s.langfuse_secret_key:
        os.environ["LANGFUSE_SECRET_KEY"] = s.langfuse_secret_key
    if s.langfuse_base_url:
        os.environ["LANGFUSE_BASE_URL"] = s.langfuse_base_url


# Global settings instance
settings = Settings()
_sync_langfuse_sdk_environment(settings)


def get_settings() -> Settings:
    """Get application settings."""
    return settings
