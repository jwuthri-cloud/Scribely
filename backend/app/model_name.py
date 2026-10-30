"""Central mapping of model names to OpenRouter model IDs."""

# OpenAI GPT
GPT_NANO = "openai/gpt-5.6-luna"
GPT_MINI = "openai/gpt-5.6-terra"
GPT_NORMAL = "openai/gpt-5.6-sol"

# Anthropic Claude
CLAUDE_HAIKU = "anthropic/claude-4.5-haiku"
CLAUDE_SONNET = "anthropic/claude-4.6-sonnet"
CLAUDE_OPUS = "anthropic/claude-4.6-opus"

# Google
GEMINI_FLASH_LITE = "google/gemini-3.1-flash-lite-preview"
GEMINI_FLASH = "google/gemini-3.1-flash-preview"
GEMINI_PRO = "google/gemini-3.1-pro-preview"

# Xai
GROK_FAST = "x-ai/grok-4.1-fast"
GROK_NORMAL = "x-ai/grok-4.20"

# Image generation
GEMINI_FLASH_IMAGE_PREVIEW = "google/gemini-3.1-flash-image-preview"
OPENAI_IMAGE_MINI = "openai/gpt-5-image-mini"
OPENAI_IMAGE = "openai/gpt-5-image"
GROK_IMAGE = "x-ai/grok-4.20-multi-agent"

# Video Generation
GEMINI_VEO = "google/veo-3.1"

# Embeddings
OPENAI_EMBEDDING_SMALL = "openai/text-embedding-3-small"
OPENAI_EMBEDDING_LARGE = "openai/text-embedding-3-large"
GEMINI_EMBEDDING_SMALL = "google/gemini-embedding-001"
GEMINI_EMBEDDING_LARGE = "google/gemini-embedding-2-preview"

# Convenience aliases (most common defaults)
DEFAULT_CHAT = GPT_NANO
DEFAULT_TRAINING = GPT_MINI
DEFAULT_VISION = GPT_NORMAL

# Default OpenRouter embeddings (small / fast)
DEFAULT_EMBEDDING = OPENAI_EMBEDDING_SMALL

# Chat / vision / media — single catalog (API + UI). IDs must match OpenRouter.
OPENROUTER_CHAT_MODEL_CATALOG: list[dict[str, str]] = [
    {
        "id": GPT_NANO,
        "label": "GPT 5.6 Luna",
        "description": "Fast, low cost",
        "provider": "openai",
    },
    {
        "id": GPT_MINI,
        "label": "GPT 5.6 Terra",
        "description": "Balanced speed and quality",
        "provider": "openai",
    },
    # {
    #     "id": GPT_NORMAL,
    #     "label": "GPT 5.6 Sol",
    #     "description": "Highest quality (OpenAI)",
    #     "provider": "openai",
    # },
    {
        "id": CLAUDE_HAIKU,
        "label": "Claude 4.5 Haiku",
        "description": "Fast Anthropic model",
        "provider": "anthropic",
    },
    # {
    #     "id": CLAUDE_SONNET,
    #     "label": "Claude 4.6 Sonnet",
    #     "description": "Strong reasoning",
    #     "provider": "anthropic",
    # },
    # {
    #     "id": CLAUDE_OPUS,
    #     "label": "Claude 4.6 Opus",
    #     "description": "Most capable Anthropic",
    #     "provider": "anthropic",
    # },
    {
        "id": GEMINI_FLASH_LITE,
        "label": "Gemini 3.1 Flash Lite",
        "description": "Lightweight Google model",
        "provider": "google",
    },
    {
        "id": GEMINI_FLASH,
        "label": "Gemini 3.1 Flash",
        "description": "Fast Google flagship",
        "provider": "google",
    },
    # {
    #     "id": GEMINI_PRO,
    #     "label": "Gemini 3.1 Pro",
    #     "description": "Google pro preview",
    #     "provider": "google",
    # },
    # {
    #     "id": GROK_FAST,
    #     "label": "Grok 4.1 Fast",
    #     "description": "xAI low-latency",
    #     "provider": "x-ai",
    # },
    # {
    #     "id": GROK_NORMAL,
    #     "label": "Grok 4.20",
    #     "description": "xAI general",
    #     "provider": "x-ai",
    # },
    # {
    #     "id": GEMINI_FLASH_IMAGE_PREVIEW,
    #     "label": "Gemini 3.1 Flash Image",
    #     "description": "Image generation (preview)",
    #     "provider": "google",
    # },
    # {
    #     "id": OPENAI_IMAGE_MINI,
    #     "label": "GPT 5 Image Mini",
    #     "description": "OpenAI image generation",
    #     "provider": "openai",
    # },
    # {
    #     "id": OPENAI_IMAGE,
    #     "label": "GPT 5 Image",
    #     "description": "OpenAI image (full)",
    #     "provider": "openai",
    # },
    # {
    #     "id": GROK_IMAGE,
    #     "label": "Grok 4.20 Multi",
    #     "description": "xAI image / multi-agent",
    #     "provider": "x-ai",
    # },
    # {
    #     "id": GEMINI_VEO,
    #     "label": "Veo 3.1",
    #     "description": "Video generation",
    #     "provider": "google",
    # },
]

ALLOWED_OPENROUTER_MODEL_IDS: frozenset[str] = frozenset(
    entry["id"] for entry in OPENROUTER_CHAT_MODEL_CATALOG
)


def get_chat_model_catalog() -> tuple[list[dict[str, str]], str]:
    """Return the configured web chat allowlist and default, without network calls."""
    # Local import avoids the settings module's DEFAULT_VISION import cycle.
    from app.config import get_settings

    settings = get_settings()
    if settings.chat_llm_provider == "openrouter":
        return OPENROUTER_CHAT_MODEL_CATALOG, DEFAULT_TRAINING
    model_ids = [settings.modelgo_model, *settings.modelgo_models]
    if not settings.modelgo_model or any(
        not model_id or model_id != model_id.strip() for model_id in model_ids
    ):
        raise ValueError(
            "Set MODELGO_MODEL and MODELGO_MODELS to exact ModelGo model IDs."
        )
    return [
        {
            "id": model_id,
            "label": model_id,
            "description": "Via ModelGo",
            "provider": "modelgo",
        }
        for model_id in dict.fromkeys(model_ids)
    ], settings.modelgo_model
