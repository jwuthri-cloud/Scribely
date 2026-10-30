"""Application settings loaded from environment variables."""

import ipaddress
import os
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse, urlunparse

from pydantic import AliasChoices, Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.model_name import DEFAULT_VISION

PROJECT_ROOT = Path(__file__).parent.parent


def _origin_and_www_peer(url: str) -> list[str]:
    """Return the origin and the www ↔ apex variant (e.g. scribely.xyz ↔ www.scribely.xyz)."""
    u = (url or "").strip().rstrip("/")
    if not u.startswith(("http://", "https://")):
        return []
    p = urlparse(u)
    if not p.scheme or not p.hostname:
        return [u]
    main = urlunparse((p.scheme, p.netloc, "", "", "", "")).rstrip("/")
    h = p.hostname
    try:
        ipaddress.ip_address(h)
        return [main]
    except ValueError:
        pass
    if h == "localhost" or h.endswith(".localhost"):
        return [main]
    peer_host = h[4:] if h.startswith("www.") else f"www.{h}"
    if p.port:
        peer_netloc = f"{peer_host}:{p.port}"
    else:
        peer_netloc = peer_host
    peer = urlunparse((p.scheme, peer_netloc, "", "", "", "")).rstrip("/")
    out = [main]
    if peer != main:
        out.append(peer)
    return out


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
    api_host: str = "0.0.0.0"  # nosec B104 — containers must bind all interfaces
    api_port: int = Field(
        default=8000,
        validation_alias=AliasChoices("PORT", "API_PORT"),
    )

    # Web chat only; meeting processing, rules, embeddings and training retain OpenRouter.
    chat_llm_provider: Literal["openrouter", "modelgo"] = "openrouter"
    openrouter_api_key: str = ""
    modelgo_api_key: str = ""
    modelgo_model: str = ""
    # Some models reject temperature; opt in only for models that support it.
    modelgo_send_temperature: bool = False
    # Optional additional exact model IDs exposed in the web chat picker (JSON array).
    modelgo_models: list[str] = Field(default_factory=list)

    # Langfuse Observability (optional)
    langfuse_enabled: bool = False
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_base_url: str = "https://cloud.langfuse.com"

    # Vector Database — Pinecone (optional)
    vector_db_api_key: str = ""
    vector_db_url: str = ""
    vector_db_index_name: str = "scribely-transcripts"
    vector_db_environment: str = ""

    # Web search — Tavily primary, Google Serper fallback (optional)
    tavily_api_key: str = ""
    serper_api_key: str = ""

    # External integrations — Composio (optional)
    composio_api_key: str = ""

    # LLM
    openai_api_key: str = ""

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
    # Clerk Backend API path segment for GET .../oauth_access_tokens/{provider}.
    # Clerk docs use "google"; older examples used "oauth_google". See CLERK_GOOGLE_OAUTH_PROVIDER.
    clerk_google_oauth_provider: str = "google"

    # Web Push (VAPID) — meeting reminders when browser is closed
    # Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (see backend/.env.example).
    # Without both keys, subscribe endpoints fail and the reminder loop skips sends (startup warning).
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:support@scribely.xyz"
    calendar_reminder_enabled: bool = True
    calendar_reminder_lead_minutes: int = 13
    calendar_reminder_window_seconds: int = 45
    # Absolute URL for links in push when building /calendar/{id} (no trailing slash)
    app_public_base_url: str = "http://localhost:3000"

    # Google Calendar push notifications (HTTPS URL of POST .../calendar/webhook/google)
    google_calendar_webhook_url: str = ""
    # Optional shared secret; sent to Google watch() and echoed in X-Goog-Channel-Token.
    google_calendar_webhook_token: str = ""

    # S3-compatible object storage (MinIO, R2, S3) — optional mirror for meeting files
    object_storage_enabled: bool = False
    s3_endpoint_url: Optional[str] = None
    s3_bucket: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_region: str = "us-east-1"
    s3_use_path_style: bool = True

    # Email (optional — rules engine `send_email` step via Resend)
    resend_api_key: str = ""
    resend_from_email: str = "onboarding@resend.dev"

    # File uploads
    upload_dir: str = "./uploads"
    # Max upload sizes in bytes (defaults: 1024 video, 16MB transcript)
    max_video_size_bytes: int = 1024 * 1024 * 1024
    max_transcript_size_bytes: int = 16 * 1024 * 1024

    # Background meeting pipeline (task_runner): max concurrent CPU/API-heavy runs
    meeting_processing_max_concurrent: int = Field(default=2, ge=1)
    # After restarts, re-queue meetings left PENDING/PROCESSING in DB (see task_runner)
    meeting_processing_recover_on_startup: bool = True

    # Recall.ai Desktop SDK — server-side only. The raw key must NEVER ship in the
    # desktop app; the backend mints per-recording upload tokens (see api/v1/recall.py).
    # Accepts RECALL_API_KEY or the legacy RECALLAI_API_KEY already in backend/.env.
    recall_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("RECALL_API_KEY", "RECALLAI_API_KEY"),
    )
    # Workspace region: us-west-2 | us-east-1 | eu-central-1 | ap-northeast-1
    recall_api_region: str = "us-west-2"
    # Svix signing secret for the Recall webhook (whsec_...). If unset, signature
    # verification is skipped (dev only) — set it in production.
    recall_webhook_secret: str = ""

    # Diarization & speaker attribution
    deepgram_api_key: str = ""
    assemblyai_api_key: str = ""
    diarization_provider: str = "deepgram"  # "deepgram" or "assemblyai"
    speaker_id_vision_model: str = DEFAULT_VISION
    frames_per_speaker: int = 10

    # CORS
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,https://www.scribely.xyz,https://scribely.xyz,http://frontend.railway.internal,https://frontend-production-4098.up.railway.app"
    )
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = ["*"]
    cors_allow_headers: list[str] = ["*"]

    @computed_field
    def cors_origins_list(self) -> list[str]:
        """Allowed browser origins for CORS.

        Parses ``CORS_ORIGINS``, then appends ``APP_PUBLIC_BASE_URL`` (and its www/apex peer)
        so production API calls from the marketing site work even if ``CORS_ORIGINS`` omits
        ``https://www.…`` (a common Railway footgun: env overrides the code default).
        """
        raw = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        seen = set(raw)
        for o in _origin_and_www_peer(self.app_public_base_url):
            if o not in seen:
                raw.append(o)
                seen.add(o)
        return raw


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
