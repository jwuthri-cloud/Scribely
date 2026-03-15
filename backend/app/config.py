"""Application settings loaded from environment variables."""
from pathlib import Path
from typing import Optional

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

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
    
    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

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

    # File uploads
    upload_dir: str = "./uploads"
    # Max upload sizes in bytes (defaults: 1024 video, 16MB transcript)
    max_video_size_bytes: int = 1024 * 1024 * 1024
    max_transcript_size_bytes: int = 16 * 1024 * 1024

    # Diarization & speaker attribution
    deepgram_api_key: str = ""
    assemblyai_api_key: str = ""
    diarization_provider: str = "deepgram"  # "deepgram" or "assemblyai"
    speaker_id_vision_model: str = "openai/gpt-5.2"  # OpenRouter model ID
    frames_per_speaker: int = 10

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:8000"
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = ["*"]
    cors_allow_headers: list[str] = ["*"]
    
    @computed_field
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS_ORIGINS string into list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get application settings."""
    return settings
