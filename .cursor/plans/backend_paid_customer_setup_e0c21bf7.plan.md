---
name: Backend Paid Customer Setup
overview: "Set up the backend for paid customers: verify Clerk auth, add meeting sync from Electron to backend when a meeting ends, and simplify the database to users-only by removing all non-user tables."
todos: []
isProject: false
---

# Backend for Paid Customers

## Current State

- **Backend**: FastAPI at `backend/` with async SQLAlchemy, Clerk JWT verification via JWKS
- **Electron auth**: Clerk sign-in flow stores session token (encrypted) in electron-store; token is a standard Clerk JWT
- **Meeting end flow**: [Overlay.tsx](desktop/src/renderer/src/components/Overlay.tsx) `handleStopMeeting` saves transcript locally via `meeting:save-transcript` IPC; no backend sync exists
- **Database**: Schema has `users`, `conversations`, `messages`, `agents`, `agent_runs`; User model has `clerk_id` for Clerk mapping

## Architecture Overview

```mermaid
flowchart TB
    subgraph Electron [Electron App]
        AuthService[AuthService]
        Overlay[Overlay handleStopMeeting]
        AuthService -->|sessionToken| Store[(electron-store)]
        Overlay -->|saveTranscript| Pipeline[Pipeline IPC]
        Pipeline -->|write| Local[(~/Documents/Scribely)]
    end
    
    subgraph Backend [FastAPI Backend]
        ClerkAuth[Clerk JWT verify]
        AuthAPI[/api/v1/auth/*]
        MeetingAPI[/api/v1/meetings POST]
        UserRepo[UserRepository]
        DB[(PostgreSQL/SQLite)]
        ClerkAuth --> AuthAPI
        AuthAPI --> UserRepo
        MeetingAPI --> ClerkAuth
        UserRepo --> DB
    end
    
    Electron -->|Bearer token + meeting payload| MeetingAPI
```



---

## 1. Verify Clerk Connection

**Goal**: Ensure the Electron app can authenticate against the backend with the stored Clerk JWT.

**Backend** (already implemented):

- [clerk_auth.py](backend/app/security/clerk_auth.py): JWT verification via Clerk JWKS
- [auth.py](backend/app/api/v1/auth.py): `/me`, `/status`, `/validate`, `/check-config`, `/health`

**Electron** (gaps):

- No `BACKEND_API_URL` (or similar) env var — the desktop app has no config for where to call the backend
- No code path that uses the stored session token to call backend APIs

**Tasks**:

- Add `BACKEND_API_URL` to [desktop/.env.example](desktop/.env.example) (e.g. `http://localhost:8000`)
- Add backend URL to desktop config (settings or env) and expose via preload/IPC
- Create a small backend client in the main process that:
  - Uses `AuthService.getSessionToken()` for the Bearer token
  - Calls `GET /api/v1/auth/status` or `POST /api/v1/auth/validate` to verify connection
- Add a "Verify connection" or health check in the UI (e.g. Settings) that calls this endpoint when the user is authenticated
- Ensure CORS allows requests from `app://` or `file://` (Electron) — FastAPI CORS may need `cors_origins` to include Electron origins if applicable; typically Electron uses `fetch` without CORS for external APIs, so this may be fine

---

## 2. Meeting Sync: Electron → Backend on Meeting End

**Goal**: When an authenticated user finishes a meeting, send meeting data to the backend.

**Flow**:

1. User stops meeting → `handleStopMeeting` in [Overlay.tsx](desktop/src/renderer/src/components/Overlay.tsx)
2. Transcript is saved locally (existing behavior)
3. **New**: If user is authenticated and `BACKEND_API_URL` is set, POST meeting payload to backend with Bearer token

**Backend**:

- New endpoint: `POST /api/v1/meetings` (or `POST /api/v1/meetings/sync`)
- Requires auth: `Depends(require_current_user)`
- Request body: transcript entries, `sessionId`, `recordingFilepath` (optional), metadata
- **For now**: Accept payload, validate, return 200. No meetings table yet ("we will do the rest later")
- **User sync**: On first authenticated request, upsert user from Clerk into `users` table (ensure `UserRepository` is used so DB has the user)

**Electron**:

- After `saveTranscript` succeeds in `handleStopMeeting`, check `authGetState().mode === 'authenticated'` and `BACKEND_API_URL`
- Call new IPC: `meeting:sync-to-backend` with transcript payload
- Main process: use `AuthService.getSessionToken()`, POST to `{BACKEND_API_URL}/api/v1/meetings` with `Authorization: Bearer {token}`
- Handle 401 (re-auth), network errors, and non-2xx responses gracefully (e.g. log, optional toast)

**Payload shape** (minimal for MVP):

```json
{
  "sessionId": "uuid",
  "recordingFilepath": "/path/to/recording.webm",
  "entries": [{ "id", "speaker", "text", "startTime", "endTime", "source" }],
  "summary": { "totalEntries", "speakers", "durationMs" }
}
```

---

## 3. Database: Users-Only Schema

**Goal**: Remove all tables except `users`; DB handles only users for now.

**Current schema** ([001_initial_schema.py](backend/alembic/versions/001_initial_schema.py)):

- `users`, `conversations`, `messages`, `agents`, `agent_runs`

**Approach**: New Alembic migration `002_drop_non_user_tables` that:

1. Drops FKs and tables in dependency order: `agent_runs` → `agents` → `messages` → `conversations`
2. Keeps `users` table
3. Drops unused enums: `agentrunstatusenum`, `messageroleenum`, `conversationstatusenum` (keep `userstatusenum` if used by users)

**Model cleanup**:

- Remove or stub `Conversation`, `Message`, `Agent`, `AgentRun` from [models/**init**.py](backend/app/database/models/__init__.py) so they are not imported by Base metadata (otherwise `create_all` would recreate them)
- Update [database/base.py](backend/app/database/base.py) so `Base.metadata` only includes `User`
- Fix any imports of dropped models in repositories, API routes, CLI (e.g. [database.py](backend/app/cli/commands/database.py) seed command references `UserRepository` with different schema — seed uses `clerk_id`; User model expects `clerk_id` but seed may use `create(email=..., username=...)` — verify `UserRepository.create` signature)
- Update CLI `database reset` to work with async/session — it uses sync `SessionLocal` and `drop_tables`/`create_tables`; ensure these still work with users-only schema

**User sync on auth**:

- Add middleware or dependency that, on authenticated requests, upserts the user from `ClerkUser` into `users` via `UserRepository.get_by_clerk_id` / `UserRepository.create`
- Ensures every authenticated API call has a corresponding DB user

---

## 4. Implementation Order


| Step | Task                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| 1    | Database: Create migration 002 to drop non-user tables; update models and Base metadata to users-only            |
| 2    | Backend: Add user upsert on authenticated requests (middleware or auth dependency)                               |
| 3    | Backend: Add `POST /api/v1/meetings` endpoint (auth required, accept payload, return 200)                        |
| 4    | Desktop: Add `BACKEND_API_URL` config and backend client in main process                                         |
| 5    | Desktop: Add `meeting:sync-to-backend` IPC; call it from `handleStopMeeting` after local save when authenticated |
| 6    | Verification: Manual test — sign in, run meeting, stop, confirm backend receives request and user exists in DB   |


---

## Key Files to Modify

**Backend**:

- `backend/alembic/versions/002_drop_non_user_tables.py` (new)
- `backend/app/database/models/__init__.py` — remove Conversation, Message, Agent, AgentRun exports
- `backend/app/database/base.py` — ensure only User is in metadata (or remove dropped models from Base)
- `backend/app/api/v1/router.py` — include new meetings router
- `backend/app/api/v1/meetings.py` (new) — POST endpoint
- `backend/app/security/clerk_auth.py` or `backend/app/api/deps.py` — add user upsert on auth
- `backend/app/cli/commands/database.py` — fix seed for users-only (UserRepository.create needs clerk_id)

**Desktop**:

- `desktop/.env.example` — add BACKEND_API_URL
- `desktop/src/main/index.ts` — register meeting sync IPC, inject backend URL
- `desktop/src/main/auth/auth-service.ts` — expose getSessionToken if needed for sync (already exists)
- New: `desktop/src/main/backend-client.ts` or similar — HTTP client with Bearer token
- `desktop/src/renderer/src/components/Overlay.tsx` — call sync after saveTranscript when authenticated
- `desktop/src/preload/index.ts` — expose sync-related IPC if needed
- `desktop/src/renderer/src/types/index.ts` — add new IPC types

---

## Open Questions

1. **Recording file**: Should the Electron app upload the recording file to the backend now, or only send metadata (e.g. `recordingFilepath` as a string)? For MVP, metadata-only is simpler.
2. **Clerk config**: Are `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` already set in `backend/.env`? The plan assumes they are; if not, add to `.env.example` and document.
3. **Backend URL**: Should `BACKEND_API_URL` be user-configurable in Settings, or only via env var?

