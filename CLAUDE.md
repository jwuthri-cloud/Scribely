# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AssistMe is a monorepo with three applications: a FastAPI backend, a Next.js frontend, and an Electron desktop overlay app. The backend provides LLM chat via OpenRouter (500+ models) using LangChain, with Clerk authentication.

## Repository Structure

- `backend/` — FastAPI (Python 3.13+, managed with `uv`)
- `frontend/` — Next.js 14 App Router (TypeScript, npm)
- `desktop/` — Electron 34 overlay app (TypeScript, npm, electron-vite)
- `docker-compose.yml` — Full stack orchestration (PostgreSQL, Redis, Kafka, RabbitMQ, Celery)

## Development Commands

### Backend
```bash
cd backend
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Linting/formatting
black .
isort .
ruff check .
mypy .

# Tests
pytest                          # all tests (includes coverage by default)
pytest tests/unit/              # unit tests only
pytest tests/integration/       # integration tests only
pytest -k "test_name"           # single test by name
pytest -x                       # stop on first failure

# Database migrations
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Frontend
```bash
cd frontend
npm install
npm run dev                     # dev server on port 3000
npm run build                   # production build
npm run lint                    # ESLint
npm run lint:fix                # ESLint autofix
npm run type-check              # TypeScript check
npm run format                  # Prettier
npm test                        # Jest unit tests
npm run test:coverage           # with coverage
npm run test:e2e                # Playwright E2E
```

### Desktop
```bash
cd desktop
npm install
npm run dev                     # dev with hot reload
npm run build                   # production build
npm run typecheck               # TypeScript check
```

### Docker
```bash
docker-compose up -d            # start all services
docker-compose up -d backend    # single service
```

## Architecture

### Backend (`backend/app/`)

Entry point: `main.py`. API versioned under `api/v1/` (auth, chat, health, metrics).

Key layers:
- **API** (`api/v1/`) — FastAPI route handlers with dependency injection
- **Services** (`services/`) — Business logic
- **Database** (`database/models/`, `database/repositories/`) — SQLAlchemy 2.0 async ORM with repository pattern. SQLite for dev, PostgreSQL for production
- **Infrastructure** (`infrastructure/`) — `llm_provider.py` (OpenRouterProvider wrapping LangChain's ChatOpenAI), Langfuse handler for LLM observability
- **Agents** (`agents/`) — LangChain/LangGraph agents organized as `agents/`, `prompt/`, `tool/`, `structured_output/`
- **Core** (`core/`) — Config (Pydantic Settings), CQRS bus, security (Clerk JWT validation)
- **Training** (`training/`) — Agent training with AgentLightning (APO, VERL, SFT)

Patterns: async-first, dependency injection via FastAPI `Depends()`, CQRS for commands/queries, structured logging with correlation IDs.

### Frontend (`frontend/src/`)

Next.js 14 App Router with Clerk auth middleware (`middleware.ts`).

- `app/` — Pages and layouts (App Router file-based routing)
- `components/ui/` — Reusable UI primitives; `components/chat/` — Chat feature
- `components/providers/` — Context providers (theme, toast)
- `hooks/` — Custom hooks (useChat, useDebounce, useLocalStorage)
- `lib/api.ts` — Centralized Axios client with Clerk auth headers
- `types/` — TypeScript interfaces

### Desktop (`desktop/src/`)

Electron app with screen-share invisibility (macOS `NSWindow.sharingType = .none`).

- `main/` — Electron main process (window management, global hotkeys)
- `preload/` — Secure IPC bridge
- `renderer/` — React + Tailwind UI with theme system
- Uses `smart-whisper` for local speech-to-text via ONNX Runtime

## LLM Integration

Always use `OpenRouterProvider` from `app/infrastructure/llm_provider.py` to get LLM instances — never initialize LangChain LLMs directly. Model names use OpenRouter format: `"provider/model-name"` (e.g., `"openai/gpt-4o-mini"`, `"anthropic/claude-3-sonnet"`).

Build chains with LangChain's pipe operator: `prompt | llm | parser`.

## Code Style

- **Backend**: Black (88 char), isort (Black profile), ruff, mypy strict. Type hints required. Pydantic v2 for all API contracts.
- **Frontend**: ESLint (Next.js config), Prettier, TypeScript strict mode. Tailwind CSS for styling.
- **Pre-commit hooks**: Configured in `.pre-commit-config.yaml` — runs Black, isort, autoflake, flake8, mypy, Prettier, ESLint, Hadolint, private key detection.

## Environment Setup

Copy template files before running:
```bash
cp backend/.env.template backend/.env        # set OPENROUTER_API_KEY, CLERK_SECRET_KEY
cp frontend/.env.template frontend/.env.local # set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_API_URL
```
