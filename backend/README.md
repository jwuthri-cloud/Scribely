# Scribely Backend

A FastAPI + Next.js AI agent application with OpenRouter

A clean, simple FastAPI backend with LangChain integration for LLM-powered applications.

## ✨ Features

### Core Features
- **🚀 FastAPI**: Modern, fast web framework for building APIs
- **🔐 Clerk Authentication**: Enterprise-grade authentication with JWT
- **🗄️ Database**: SQLAlchemy async with PostgreSQL/SQLite support
- **🔗 LangChain Integration**: OpenRouter provider for LLM access
- **🤖 Agents Framework**: Modular agent structure with prompts, tools, and structured outputs
- **📊 Health & Metrics**: Simple health checks and metrics endpoints
- **📝 Structured Logging**: Request tracing and logging utilities

### LangChain & LLM Features
- **OpenRouter Provider**: Unified access to multiple LLM providers
- **Model Fallbacks**: Automatic fallback to backup models on failures
- **OpenRouter Embeddings**: Direct embeddings support via OpenRouter
- **Langfuse Integration**: Automatic LLM tracing and observability
- **Token Counting**: Accurate token counting utilities
- **Agent Framework**: Modular agent structure (agents/prompt/tool/structured_output)
- **Context Management**: Built-in context management agent
- **Tool Support**: LangChain tools for agent workflows

### Meeting Processing & Speaker Attribution
- **Post-meeting diarization**: Deepgram Nova-3 and AssemblyAI Universal-2 support
- **Speaker identification**: LLM vision analysis of video frames to map anonymous speakers to real names
- **Background processing**: Automatic pipeline triggered on meeting upload
- **Meeting upload API**: Transcript + recording sync from the desktop app

## 🏗️ Architecture

```
app/
├── main.py                    # FastAPI application entry point
├── config.py                  # Configuration from environment variables
├── exceptions.py              # Exception handlers
│
├── api/                       # API endpoints
│   ├── v1/
│   │   ├── router.py         # Main API router
│   │   ├── auth.py           # Clerk authentication endpoints
│   │   ├── meetings.py       # Meeting upload + diarization endpoints
│   │   ├── health.py         # Health check endpoints
│   │   └── metrics.py        # Metrics endpoints
│   ├── deps.py               # API-specific dependencies
│   └── response_wrapper.py   # API response utilities
│
├── agents/                    # LangChain agents framework
│   ├── agents/               # Agent implementations
│   │   ├── customer_support.py
│   │   └── speaker_identifier.py  # LLM vision speaker ID
│   ├── prompt/               # Prompt templates
│   │   ├── customer_support.py
│   │   └── speaker_identifier.py
│   ├── tool/                 # LangChain tools
│   │   └── customer_support.py
│   └── structured_output/    # Pydantic output models
│       ├── customer_support.py
│       └── speaker_identifier.py
│
├── database/                  # Database layer
│   ├── base.py               # SQLAlchemy base
│   ├── session.py            # Async session management
│   ├── transaction.py        # Transaction utilities
│   ├── models/               # Database models
│   │   └── user.py           # User model (Clerk-based auth)
│   └── repositories/         # Data access layer
│       └── user.py           # User repository
│
├── services/                  # Business logic services
│   ├── audio_extractor.py    # ffmpeg: WebM/MP4 → WAV extraction
│   ├── diarization.py        # Deepgram / AssemblyAI diarization
│   ├── frame_extractor.py    # ffmpeg: video frame extraction per speaker
│   ├── speaker_identifier.py # Service wrapper for speaker ID agent
│   ├── meeting_processor.py  # Post-meeting processing orchestrator
│   └── task_runner.py        # Async background task runner
│
├── infrastructure/            # Infrastructure layer
│   ├── llm_provider.py       # OpenRouter LLM provider & embeddings
│   └── langfuse_handler.py   # Langfuse observability integration
│
├── models/                    # Pydantic API models
│   ├── base.py               # Base response models
│   └── user.py               # User API models
│
├── security/                  # Security utilities
│   └── clerk_auth.py         # Clerk authentication
│
├── middleware/                # Middleware
│   └── __init__.py           # Logging, CORS, security headers
│
├── utils/                     # Utilities
│   ├── logging.py            # Logging configuration
│   ├── token_counter.py      # Token counting utilities
│   ├── exceptions.py         # Exception utilities
│   ├── helpers.py            # Helper functions
│   └── retry.py              # Retry logic
│
├── scripts/                   # Standalone utility scripts
│   └── test_diarization.py   # CLI for testing diarization pipeline
│
├── cli/                       # CLI commands
│   ├── commands/             # CLI command modules
│   │   ├── database.py       # Database management
│   │   ├── health.py         # Health checks
│   │   ├── llm.py            # LLM testing/management
│   │   ├── logs.py           # Log viewing
│   │   ├── server.py         # Server management
│   │   ├── setup.py          # Setup utilities
│   │   └── worker.py         # Worker management (if needed)
│   └── main.py               # CLI entry point
│
└── examples/                  # Example code
    ├── langchain_example.py   # LangChain usage examples
    ├── agent_example.py       # Agent usage examples
    └── tool_example.py        # Tool usage examples
```

## 🚀 Quick Start

### Prerequisites

- **Python**: 3.13+
- **OpenRouter API Key**: Get one at https://openrouter.ai
- **Clerk Account**: Get one at https://clerk.dev (optional, for auth)

### 1. Configuration Setup

```bash
# Copy the configuration template
cp .env.template .env

# Edit your configuration
nano .env  # or use your preferred editor
```

**Required Settings:**

```bash
# OpenRouter API Key (required for LLM features)
OPENROUTER_API_KEY=your-openrouter-api-key-here

# Database (SQLite by default)
DATABASE_URL=sqlite+aiosqlite:///./app.db

# Clerk Authentication (optional)
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 2. Install Dependencies

```bash
# Using uv (recommended)
curl -LsSf https://astral.sh/uv/install.sh | sh
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -e .

# Or using pip
pip install -e .
```

### 3. Database Setup

```bash
# Run migrations (preferred — keeps alembic_version in sync)
alembic upgrade head

# Or initialize database
python -m app.cli database init
```

**Local dev note:** On startup the API also runs `Base.metadata.create_all()`, which can create new tables before Alembic has stamped the matching revision. If `alembic upgrade` ever complained about tables that already exist, recent migrations use `IF NOT EXISTS` so a re-run is safe. If your schema already matches `head` but `alembic_version` is behind, you can align the stamp only: `alembic stamp head` (does not run DDL — use only when you are sure the DB matches the migration chain).

### 4. Start the Server

```bash
# Development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Or using Python directly
python -m app.main
```

### 5. Access the Application

| Service | URL | Description |
|---------|-----|-------------|
| **🚀 Backend API** | http://localhost:8000 | Main API server |
| **📚 API Documentation** | http://localhost:8000/docs | Interactive Swagger UI |
| **🏥 Health Checks** | http://localhost:8000/api/v1/health/ | Service health monitoring |

## 📡 API Usage

### Health Checks

```bash
# Main health check
curl "http://localhost:8000/api/v1/health/"

# Readiness probe
curl "http://localhost:8000/api/v1/health/ready"

# Liveness probe
curl "http://localhost:8000/api/v1/health/live"
```

### Authentication (Clerk)

All authentication is handled by Clerk. Users authenticate via Clerk's frontend SDK, and the backend validates JWT tokens.

```bash
# Get current user profile (requires authentication)
curl -X GET "http://localhost:8000/api/v1/auth/me" \
  -H "Authorization: Bearer YOUR_CLERK_JWT_TOKEN"

# Check authentication status (optional auth)
curl -X GET "http://localhost:8000/api/v1/auth/status" \
  -H "Authorization: Bearer YOUR_CLERK_JWT_TOKEN"

# Get Clerk configuration for frontend
curl "http://localhost:8000/api/v1/auth/config"

# Validate JWT token
curl -X POST "http://localhost:8000/api/v1/auth/validate" \
  -H "Authorization: Bearer YOUR_CLERK_JWT_TOKEN"

# Check Clerk configuration status
curl "http://localhost:8000/api/v1/auth/check-config"

# Authentication health check
curl "http://localhost:8000/api/v1/auth/health"
```

**Available Auth Endpoints:**

- `GET /api/v1/auth/me` - Get current user profile (requires auth)
- `GET /api/v1/auth/status` - Get auth status (optional auth)
- `GET /api/v1/auth/config` - Get Clerk config for frontend
- `GET /api/v1/auth/user/{user_id}` - Get user by ID (requires auth)
- `POST /api/v1/auth/validate` - Validate JWT token (requires auth)
- `GET /api/v1/auth/check-config` - Check Clerk configuration
- `GET /api/v1/auth/protected` - Example protected route (requires auth)
- `GET /api/v1/auth/health` - Auth system health check

### Metrics

```bash
# Get application metrics
curl "http://localhost:8000/api/v1/metrics/"

# Get metrics summary
curl "http://localhost:8000/api/v1/metrics/summary"
```

## 🤖 LangChain & Agents Usage

### Basic LangChain Example

```python
from app.infrastructure.llm_provider import OpenRouterProvider
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# Initialize provider
provider = OpenRouterProvider()

# Get LLM instance (Langfuse automatically enabled if configured)
llm = provider.get_llm(model_name="openai/gpt-5.6-terra", temperature=0.7)

# Create chain
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("user", "{input}")
])

chain = prompt | llm | StrOutputParser()

# Use chain
response = chain.invoke({"input": "Hello!"})
print(response)
```

### Model Fallbacks

OpenRouter supports automatic model fallbacks. If the primary model fails (rate limits, downtime, moderation, etc.), it automatically tries the next model in the list.

```python
from app.infrastructure.llm_provider import OpenRouterProvider

provider = OpenRouterProvider()

# Method 1: Using get_llm with fallback_models parameter
llm = provider.get_llm(
    model_name="anthropic/claude-4.6-sonnet",
    fallback_models=["openai/gpt-5.6-terra", "gryphe/mythomax-l2-13b"]
)

# Method 2: Using get_llm_with_fallbacks (convenience method)
llm = provider.get_llm_with_fallbacks([
    "anthropic/claude-4.6-sonnet",  # Primary model
    "openai/gpt-5.6-terra",            # First fallback
    "gryphe/mythomax-l2-13b"        # Second fallback
])

# Use with chain
chain = prompt | llm | StrOutputParser()
response = chain.invoke({"input": "Hello!"})
```

**Provider Routing** (control which provider endpoints to use):

```python
llm = provider.get_llm(
    model_name="mistralai/mixtral-8x7b-instruct",
    provider_config={
        "order": ["openai", "together"],  # Try OpenAI first, then Together AI
        "allow_fallbacks": True           # Allow other providers if both fail
    }
)
```

### OpenRouter Embeddings

Generate embeddings using OpenRouter's embedding models:

```python
from app.infrastructure import OpenRouterEmbeddings

# Initialize embeddings
embeddings = OpenRouterEmbeddings(
    model="openai/text-embedding-3-small"  # Default model
)

# Embed documents
documents = ["Hello world", "How are you?"]
vectors = embeddings.embed_documents(documents)

# Embed a single query
query_vector = embeddings.embed_query("What is this about?")

# Async support
vectors_async = await embeddings.aembed_documents(documents)
query_vector_async = await embeddings.aembed_query("Query text")
```

### Langfuse Observability

Langfuse automatically tracks all LLM calls when enabled, providing detailed traces, token usage, costs, and more.

**Setup:**

1. Enable Langfuse in your `.env`:
```bash
LANGFUSE_ENABLED=true
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

2. Langfuse is automatically enabled for all LLM calls:
```python
# Langfuse automatically tracks this call
llm = provider.get_llm(model_name="openai/gpt-5.6-terra")
response = chain.invoke({"input": "Hello!"})
```

**Filtering Attributes** (for easy filtering in Langfuse UI):

```python
from app.infrastructure.langfuse_handler import get_langfuse_config

# Build config with filtering attributes
config = get_langfuse_config(
    session_id="chat-session-123",      # Group related traces
    user_id="user_456",                  # User-level filtering
    tags=["production", "chat"],         # Custom tags
    metadata={"request_id": "req-789"}   # Custom metadata
)

# Use with chain invocation
response = chain.invoke(
    {"input": "Hello!"},
    config=config
)
```

**Using with `create_agent`:**

```python
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from app.infrastructure.langfuse_handler import get_langfuse_config
from app.infrastructure.llm_provider import OpenRouterProvider

# Initialize provider
provider = OpenRouterProvider()
llm = provider.get_llm(model_name="openai/gpt-5.6-terra")

# Create agent with structured output
agent = create_agent(
    model=llm,
    system_prompt="You are a helpful assistant.",
    tools=[],  # Add your tools here
    response_format=YourPydanticModel,  # Your structured output model
)

# Build Langfuse config with filtering attributes
langfuse_config = get_langfuse_config(
    session_id="agent-session-123",
    user_id="user_456",
    tags=["agent", "structured-output"],
    metadata={"agent_type": "analysis"}
)

# Invoke agent with Langfuse config
result = await agent.ainvoke(
    {"messages": [HumanMessage(content="Your input here")]},
    config=langfuse_config  # Pass config as second parameter
)

# Or synchronously
result = agent.invoke(
    {"messages": [HumanMessage(content="Your input here")]},
    config=langfuse_config
)
```

**Available Filtering Attributes:**
- `session_id`: Groups related traces (e.g., chat sessions)
- `user_id`: Enables user-level filtering and analytics
- `tags`: Custom labels (e.g., `["prod", "chat", "v2"]`)
- `metadata`: Custom key-value pairs for additional context
- `run_name`: Optional name for the trace

**Disable Langfuse for specific calls:**
```python
llm = provider.get_llm(
    model_name="openai/gpt-5.6-terra",
    enable_langfuse=False  # Disable Langfuse for this call
)
```

View your traces at: https://cloud.langfuse.com

### Using Agents

```python
from app.agents import CustomerSupportAgent
from app.infrastructure.llm_provider import OpenRouterProvider

# Initialize
provider = OpenRouterProvider()
agent = CustomerSupportAgent(
    llm_provider=provider,
    model_name="openai/gpt-5.6-terra",
    temperature=0.7
)

# Handle customer inquiry (async)
response = await agent.handle_inquiry(
    customer_message="I need help with my order",
    customer_id="user_123",
    session_id="support-session-456"
)

print(f"Response: {response.response}")
print(f"Requires escalation: {response.requires_escalation}")
print(f"Confidence: {response.confidence}")
```

### Using Tools

```python
from app.agents.tool.customer_support import (
    search_knowledge_base,
    check_order_status,
    create_support_ticket,
    CUSTOMER_SUPPORT_TOOLS
)

# Use tools directly
kb_result = search_knowledge_base.invoke({"query": "return policy"})
order_info = check_order_status.invoke({"order_id": "ORD-123"})

# Bind tools to LLM
from app.infrastructure.llm_provider import OpenRouterProvider

provider = OpenRouterProvider()
llm = provider.get_llm(model_name="openai/gpt-5.6-terra")
llm_with_tools = llm.bind_tools(CUSTOMER_SUPPORT_TOOLS)

# LLM can now use these tools
response = llm_with_tools.invoke("Check order status for ORD-123")
```

### Token Counting

```python
from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.token_counter import count_tokens_llm, get_model_limits

provider = OpenRouterProvider()
llm = provider.get_llm(model_name="openai/gpt-5.6-terra")

# Count tokens
text = "Hello, how are you?"
token_count = count_tokens_llm(llm, text)

# Get model limits
limits = get_model_limits(provider, "openai/gpt-5.6-terra")
print(f"Context length: {limits['context_length']}")
print(f"Max completion: {limits['max_completion_tokens']}")
```

## Meeting Processing & Speaker Attribution

After a meeting ends, the desktop app uploads the transcript and recording to the backend. A background pipeline then runs diarization and speaker identification.

### How It Works

1. **Audio extraction** -- ffmpeg converts the WebM/MP4 recording to 16 kHz mono WAV
2. **Diarization** -- Deepgram Nova-3 or AssemblyAI Universal-2 transcribes with speaker labels (`Speaker 0`, `Speaker 1`, ...)
3. **Frame extraction** -- ffmpeg grabs ~10 video frames per speaker at moments when they were talking
4. **Speaker identification** -- An LLM vision model (via OpenRouter) analyses all frames in a single call to map anonymous labels to real names
5. **Enriched transcript** -- Results saved as `transcript_enriched.json` alongside the original

### Prerequisites

- **ffmpeg** must be installed (`brew install ffmpeg` on macOS)
- **Deepgram API key** and/or **AssemblyAI API key** (set in `.env`)
- **OpenRouter API key** (for the LLM vision step)

### Configuration

```bash
# In .env
DIARIZATION_PROVIDER=deepgram          # or "assemblyai"
DEEPGRAM_API_KEY=your-key-here
ASSEMBLYAI_API_KEY=your-key-here       # only needed if using assemblyai
OPENROUTER_API_KEY=your-key-here       # used for vision speaker identification
# SPEAKER_ID_VISION_MODEL=openai/gpt-5.6-sol  # default vision model
# FRAMES_PER_SPEAKER=10                   # frames extracted per speaker
```

### CLI Commands

Test diarization on any audio/video file without starting the server:

```bash
# Diarization only (transcribe + speaker labels)
poe diarize /path/to/meeting.mp4
poe diarize /path/to/meeting.webm --provider assemblyai

# Full pipeline (diarize + frame extraction + LLM vision speaker ID)
poe diarize-full /path/to/meeting.mp4
poe diarize-full /path/to/meeting.mp4 --provider assemblyai
```

Results are saved next to the input file as `diarization_<provider>.json` (or `diarization_full_<provider>.json` for the full pipeline).

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/meetings/` | Upload meeting (transcript + optional recording). Triggers background processing automatically when a recording is included. |
| `GET` | `/api/v1/meetings/{id}/status` | Poll diarization processing status (`pending` / `processing` / `completed` / `failed`) |
| `GET` | `/api/v1/meetings/{id}/transcript` | Get enriched transcript (falls back to original if not yet processed) |
| `POST` | `/api/v1/meetings/{id}/reprocess` | Re-trigger processing, optionally with a different provider (`?provider=assemblyai`) |

### Pipeline Architecture

```
WebM/MP4 recording
    │
    ▼
┌──────────────────┐
│  Audio Extraction │  ffmpeg → 16kHz mono WAV
└────────┬─────────┘
         ▼
┌──────────────────┐
│   Diarization    │  Deepgram Nova-3 / AssemblyAI Universal-2
│                  │  → Speaker 0, Speaker 1, ... with timestamps
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Frame Extraction │  ffmpeg → ~10 JPEG frames per speaker
│                  │  at midpoints of their utterances
└────────┬─────────┘
         ▼
┌──────────────────┐
│  LLM Vision ID   │  Single OpenRouter call with all frames
│                  │  → { "Speaker 0": "Alice", "Speaker 1": "Bob" }
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Enriched Output  │  transcript_enriched.json
└──────────────────┘
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage report
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/unit/test_user_repository.py

# Run tests by marker
pytest -m unit              # Unit tests only
pytest -m integration       # Integration tests only
pytest -m database          # Database tests only

# Run with verbose output
pytest -v

# Run specific test function
pytest tests/unit/test_user_repository.py::TestUserRepository::test_create_user

# Run tests matching a pattern
pytest -k "user"            # Tests with "user" in name

# Run tests in parallel (requires pytest-xdist)
pytest -n auto
```

### Test Structure

```
tests/
├── conftest.py                    # Test fixtures and configuration
├── unit/                          # Unit tests (fast, isolated)
│   └── test_user_repository.py   # User repository tests
├── integration/                   # Integration tests
│   └── test_health_api.py        # API integration tests
└── performance/                   # Performance tests
    └── test_load_testing.py       # Load testing
```

### Test Coverage

The project aims for 80%+ test coverage. View coverage reports:

```bash
# Generate HTML coverage report
pytest --cov=app --cov-report=html

# Open coverage report
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
```

### Writing Tests

Tests use pytest with async support. Example:

```python
import pytest
from app.database.repositories import UserRepository

@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.database
class TestUserRepository:
    async def test_create_user(self, test_db_session):
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_test123",
            email="test@example.com"
        )
        assert user.clerk_id == "user_test123"
```

### Available Fixtures

- `test_db_session`: Async database session (in-memory SQLite)
- `test_user`: Pre-created test user with Clerk ID
- `client`: FastAPI test client with dependency overrides
- `test_settings`: Test-specific settings

### Test Markers

Use markers to categorize tests:

- `@pytest.mark.unit`: Fast unit tests
- `@pytest.mark.integration`: Integration tests
- `@pytest.mark.database`: Database-dependent tests
- `@pytest.mark.slow`: Tests taking >5 seconds

## 📚 Examples

Check out the example files in `app/examples/`:

- **`langchain_example.py`**: Basic LangChain usage
- **`agent_example.py`**: Using agents
- **`tool_example.py`**: Using LangChain tools
- **`create_agent_example.py`**: Using `create_agent` with Langfuse filtering attributes

Run examples:
```bash
python -m app.examples.langchain_example
python -m app.examples.agent_example
python -m app.examples.tool_example
python -m app.examples.create_agent_example
```

## 🖥️ CLI Commands

The project includes a CLI for managing various aspects of the application:

### LLM Commands

```bash
# Test OpenRouter connection
python -m app.cli llm test

# List available models
python -m app.cli llm list

# Interactive chat with a model
python -m app.cli llm chat --model openai/gpt-5.6-terra

# Chat with fallback models
python -m app.cli llm chat \
  --model anthropic/claude-4.6-sonnet \
  --fallback openai/gpt-5.6-terra \
  --fallback gryphe/mythomax-l2-13b

# Get a single completion
python -m app.cli llm complete "Tell me a joke" \
  --model openai/gpt-5.6-terra \
  --temperature 0.7

# Chat with multiple fallback models (convenience command)
python -m app.cli llm chat-fallback \
  anthropic/claude-4.6-sonnet \
  openai/gpt-5.6-terra \
  gryphe/mythomax-l2-13b

# Configure OpenRouter interactively
python -m app.cli llm config
```

### Database Commands

```bash
# Initialize database
python -m app.cli database init

# Run migrations
python -m app.cli database migrate
```

### Health Commands

```bash
# Check application health
python -m app.cli health check
```

## 🔧 Configuration

All configuration is managed through environment variables. See `.env.template` for all available options.

### Key Settings

```bash
# Database
DATABASE_URL=sqlite+aiosqlite:///./app.db

# API Server
API_HOST=0.0.0.0
API_PORT=8000

# OpenRouter (for LLM)
OPENROUTER_API_KEY=your-key-here

# Langfuse Observability (optional)
LANGFUSE_ENABLED=false
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Clerk Authentication
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# Diarization & Speaker Attribution
DIARIZATION_PROVIDER=deepgram
DEEPGRAM_API_KEY=your-deepgram-key
ASSEMBLYAI_API_KEY=your-assemblyai-key

# CORS (comma-separated origins)
CORS_ORIGINS=http://localhost:3000,http://localhost:8000

# Logging
LOG_LEVEL=INFO
DEBUG=false
```

## 🏗️ Project Structure

### Agents Framework

The agents follow a modular structure:

```
agents/
├── agents/              # Agent implementations
├── prompt/              # Prompt templates
├── tool/                # LangChain tools
└── structured_output/   # Pydantic output models
```

Each agent has:
- **Agent**: Business logic implementation
- **Prompts**: System and user prompts
- **Tools**: LangChain tools the agent can use
- **Structured Outputs**: Type-safe Pydantic models

See `app/agents/README.md` for more details.

### Database

- **Models**: `User` model (Clerk-based authentication)
  - Uses `clerk_id` as the primary identifier
  - No password fields (authentication handled by Clerk)
  - Supports user preferences and metadata
- **Repositories**: `UserRepository` with async CRUD operations
- **Async**: Full async/await support

### Infrastructure

- **LLM Provider**: OpenRouter integration with fallback support
- **Embeddings**: OpenRouter embeddings support
- **Langfuse Handler**: Automatic LLM tracing and observability
- **Token Counter**: Token counting utilities
- **Model Info**: Context limits and model information

## 🔒 Security

- **Clerk Authentication**: JWT-based authentication (no password storage)
- **CORS**: Configurable CORS settings
- **Security Headers**: Automatic security headers
- **Input Validation**: Pydantic validation

## 📊 Monitoring

- **Health Checks**: `/api/v1/health/`
- **Metrics**: `/api/v1/metrics/`
- **Structured Logging**: Request tracing with correlation IDs
- **Langfuse Observability**: LLM tracing, token usage, costs, and performance metrics

## 🚀 Production Deployment

### Docker

```bash
# Build image
docker build -t scribely-backend .

# Run container
docker run -p 8000:8000 \
  -e OPENROUTER_API_KEY=your-key \
  -e DATABASE_URL=postgresql://... \
  scribely-backend
```

### Environment Variables

Required:
- `OPENROUTER_API_KEY`: OpenRouter API key
- `DATABASE_URL`: Database connection string

Optional:
- `CLERK_SECRET_KEY`: Clerk secret key
- `CLERK_PUBLISHABLE_KEY`: Clerk publishable key
- `LANGFUSE_ENABLED`: Enable Langfuse observability (default: false)
- `LANGFUSE_SECRET_KEY`: Langfuse secret key
- `LANGFUSE_PUBLIC_KEY`: Langfuse public key
- `LANGFUSE_BASE_URL`: Langfuse host URL (default: https://cloud.langfuse.com)
- `DEEPGRAM_API_KEY`: Deepgram API key (for diarization)
- `ASSEMBLYAI_API_KEY`: AssemblyAI API key (for diarization)
- `DIARIZATION_PROVIDER`: `deepgram` or `assemblyai` (default: `deepgram`)
- `DEBUG`: Set to `false` in production
- `LOG_LEVEL`: Logging level (INFO, WARNING, ERROR)

## 🐛 Troubleshooting

### Common Issues

**OpenRouter API Key not set:**
```bash
# Set in .env file
OPENROUTER_API_KEY=your-key-here
```

**Database connection issues:**
```bash
# Check database URL
echo $DATABASE_URL

# Test connection
python -c "from app.database.session import get_async_engine; import asyncio; asyncio.run(get_async_engine())"
```

**Import errors:**
```bash
# Make sure you're in the backend directory
cd backend

# Install dependencies
uv pip install -e .
```

**Clerk authentication not working:**
```bash
# Check Clerk configuration
curl "http://localhost:8000/api/v1/auth/check-config"

# Verify JWT token format
# Tokens should start with "eyJ" (base64 encoded JWT)
```

## 📚 Additional Resources

- **API Documentation**: http://localhost:8000/docs
- **Agents README**: `app/agents/README.md`
- **LangChain Docs**: https://python.langchain.com/
- **Clerk Docs**: https://clerk.com/docs

## 📄 License

MIT License

---

**Generated by [cookiecutter-fastapi-nextjs-llm](https://github.com/your-org/cookiecutter-fastapi-nextjs-llm)**

### Optional ModelGo provider for web chat

The web chat endpoints (`/api/v1/chat/` and `/api/v1/chat/stream`) can use
[ModelGo](https://modelgo.ai) through its international OpenAI-compatible endpoint.
OpenRouter remains the default. In `backend/.env`, set:

```dotenv
CHAT_LLM_PROVIDER=modelgo
MODELGO_API_KEY=your-modelgo-api-key
MODELGO_MODEL=your-exact-model-id
# Optional additional models in the web chat picker (JSON array):
MODELGO_MODELS=["another-exact-model-id"]
# Opt in only when all configured models accept temperature:
MODELGO_SEND_TEMPERATURE=false
```

Copy model IDs exactly from your ModelGo account, including any suffix. Scribely
sends them unchanged to `https://api.modelgo.ai/v1/chat/completions`. The configured
default and additional IDs form the web chat allowlist; `/api/v1/chat/models`
returns it to the picker. Omitted or null request models use `MODELGO_MODEL`.
By default, ModelGo requests omit `temperature` and use each model's default,
even if a chat request supplies a temperature. Some models reject this parameter.
Set `MODELGO_SEND_TEMPERATURE=true` only when all configured models accept it;
then the chat request's temperature is forwarded unchanged. OpenRouter behavior
is unchanged.

Choose models that support the assistant's tools and structured responses. Model
availability and capability errors are returned through the existing chat error
handling; this integration does not guarantee every ModelGo model supports tools.

This switch applies **only to web chat**. Meeting processing, rules, embeddings,
training, CLI commands and the desktop app retain their existing providers and
credentials. Keep `OPENROUTER_API_KEY` for backend features that still need it.
ModelGo does not use OpenRouter's `models` fallback list or `provider` routing
body, and this integration provides no ModelGo balance endpoint. Return to
`CHAT_LLM_PROVIDER=openrouter` to restore the existing web chat catalog.

The mocked HTTP tests use real LangChain/OpenAI clients for completion, SSE
streaming and authentication failure, and never call a live model:

```bash
pytest tests/integration/test_chat_provider.py --no-cov -o addopts=''
```
