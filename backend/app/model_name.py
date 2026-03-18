"""Central mapping of model names to OpenRouter model IDs."""

# OpenAI GPT
GPT_NANO = "openai/gpt-5.4-nano"
GPT_MINI = "openai/gpt-5.4-mini"
GPT_NORMAL = "openai/gpt-5.4"

# Anthropic Claude
CLAUDE_SONNET = "anthropic/claude-4.6-sonnet"

# Other providers
MYTHOMAX = "gryphe/mythomax-l2-13b"
MIXTRAL = "mistralai/mixtral-8x7b-instruct"
GEMINI_PRO = "google/gemini-3-pro-preview"
GROK_FAST = "x-ai/grok-4-fast"

# Embeddings
EMBEDDING_SMALL = "openai/text-embedding-3-small"

# Convenience aliases (most common defaults)
DEFAULT_CHAT = GPT_NANO
DEFAULT_TRAINING = GPT_MINI
DEFAULT_VISION = GPT_NORMAL
