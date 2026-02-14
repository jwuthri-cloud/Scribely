# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AssistMe is a multi-component AI application: a FastAPI backend, a Next.js frontend, an Electron desktop overlay (macOS-only, invisible to screen sharing), and a Chrome extension for audio capture. The backend provides chat via OpenRouter (500+ LLMs) with LangChain, authenticated by Clerk.

## Repository Layout

- `backend/` — FastAPI (Python 3.13, async, SQLAlchemy + Alembic, LangChain + OpenRouter)
- `frontend/` — Next.js 14 App Router (React 18, TypeScript, Tailwind, Clerk auth)
- `desktop/` — Electron overlay app (macOS only, see `desktop/CLAUDE.md` for details)
- `chrome-extension/` — Browser extension for meeting audio capture

## Commands

### Backend (`cd backend`)
```bash
uv venv && source .venv/bin/activate    # Create/activate venv
uv pip install -e ".[dev]"              # Install with dev deps
uvicorn app.main:app --reload           # Dev server on :8000
pytest                                  # Run all tests (coverage auto-enabled)
pytest tests/unit/test_foo.py::TestFoo::test_bar  # Single test
black . && isort . && ruff check .      # Format + lint
mypy .                                  # Type check
alembic revision --autogenerate -m "msg"  # Create migration
alembic upgrade head                    # Apply migrations
```

### Frontend (`cd frontend`)
```bash
npm install
npm run dev           # Dev server on :3000
npm run build         # Production build
npm run lint          # ESLint
npm run type-check    # TypeScript check
npm run test          # Jest unit tests
npm run test:e2e      # Playwright E2E tests
```

### Desktop (`cd desktop`)
```bash
npm install
npm run dev           # Dev mode with HMR
npm run build:proto   # Compile .proto files (run if .proto changes)
npm run build:native  # Build Swift NativeHelper binary
npm run build         # Build main/preload/renderer
npm run typecheck     # Type check all layers
npm run dist          # Full macOS DMG
```

### Docker
```bash
docker-compose up -d  # Start Redis, PostgreSQL, Kafka/Zookeeper
```

## Architecture

### Backend
- **Entry**: `app/main.py` (FastAPI app with lifespan)
- **Routes**: `app/api/v1/` — versioned endpoints (chat, auth, health, metrics)
- **LLM**: `app/infrastructure/llm_provider.py` — `OpenRouterProvider` wraps LangChain's `ChatOpenAI` with OpenRouter base URL. Always use this, never instantiate LangChain LLMs directly. Model names use OpenRouter format: `"openai/gpt-4o-mini"`, `"anthropic/claude-3-sonnet"`
- **Agents**: `app/agents/` — LangChain agent framework with orchestrator for multi-agent coordination
- **CQRS**: `app/core/cqrs/` — command/query buses for separating reads from writes
- **Database**: SQLAlchemy async ORM in `app/database/models/`, repository pattern in `app/database/repositories/`, Alembic migrations in `alembic/`
- **Auth**: Clerk JWT validation middleware in `app/security/`
- **Config**: Pydantic settings in `app/core/config/`
- **Testing**: `tests/unit/`, `tests/integration/`, `tests/performance/` — pytest with async support (`asyncio_mode = "auto"`)

### Frontend
- App Router in `src/app/`, components in `src/components/`, hooks in `src/hooks/`
- API client in `src/lib/api.ts` using axios
- Clerk auth via `ClerkProvider` in layout, `useUser()`/`useAuth()` hooks
- State: Context API + custom hooks (no Redux)

### Desktop (macOS only)
See `desktop/CLAUDE.md` for full architecture. Key points:
- Three-process Electron model (main/preload/renderer)
- Audio pipeline: VAD + local Whisper transcription
- Screen-share invisible via `nswindow-napi`
- Native bridge to Swift daemon over Unix socket with Protobuf IPC

## Key Conventions

- **Python**: Black (88 chars), isort (black profile), ruff, mypy strict. Pydantic v2 for all validation. Async-first with `await`.
- **TypeScript**: Strict mode. Props always typed with interfaces. Tailwind utility-first styling.
- **Dependency injection**: FastAPI `Depends()` for services. Never instantiate services directly in route handlers.
- **Pre-commit hooks**: Configured in `.pre-commit-config.yaml` — runs formatters, linters, and security checks automatically.

## Environment Setup

Copy templates and fill in API keys:
```bash
cp backend/.env.template backend/.env      # Set OPENROUTER_API_KEY, CLERK_SECRET_KEY, DATABASE_URL
cp frontend/.env.template frontend/.env.local  # Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_API_URL
```
