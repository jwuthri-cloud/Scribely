# Scribely — Improvements Backlog

> Tracks all identified improvements, fixes, and feature work.
> Status: ✅ Done · 🔲 Pending

---

## Quick Wins (Low Effort / High Impact)

| # | What | Where | Status |
|---|------|-------|--------|
| 1 | Delete dead components: `MeetingView`, `TranscriptView`, `RecordingBar`, `LiveInsightsPanel` | `desktop/src/renderer/src/components/` | ✅ Done |
| 2 | Remove legacy IPC no-ops: `sendMessage`, `onMessage`, `cancelResponse` from preload + renderer types | `desktop/src/preload/index.ts`, `types/index.ts` | ✅ Done |
| 3 | Remove dead insights IPC handlers: `insights:toggle-window`, `insights:window-visible`, `insights:close-window` | `desktop/src/main/index.ts` | ✅ Done |
| 4 | Fix theme default inconsistency — electron-store and `DEFAULT_SETTINGS` both said `atom-dark` but registry defaults to `nord` | `main/index.ts`, `types/settings.ts` | ✅ Done |
| 5 | Add URL scheme validation to `open-external-url` — restrict to `http`/`https` only | `desktop/src/main/index.ts` | ✅ Done |
| 6 | Remove broken Celery/Kafka/RabbitMQ/Zookeeper from `docker-compose.yml` — `app.core.celery_app` doesn't exist | `docker-compose.yml` | ✅ Done |
| 7 | Add `SCRIBELY_SKIP_NATIVE` and `CONSOLA_LEVEL` to `.env.example` | `desktop/.env.example` | ✅ Done |
| 8 | Remove unused `@traceloop/node-server-sdk` dependency (listed in `package.json`, never imported) | `desktop/package.json` | ✅ Done |
| 9 | Fix Chrome extension README + cursor rule stale `content-script.js` references | `chrome-extension/README.md`, `.cursor/rules/chrome-extension-architecture.mdc` | ✅ Done |
| 10 | Fix backend `APP_NAME` drift — `.env.example` said `"AssistMe"`, `config.py` defaults to `"Scribely"` | `backend/.env.example` | ✅ Done |
| 11 | Resolve 4 unregistered theme files (`atom-dark`, `tokyo-night`, `gruvbox-dark`, `one-dark-pro`) — either register them in `registry.ts` or delete the files | `desktop/src/renderer/src/themes/` | ✅ Done |
| 12 | Remove or finish `AgentOrchestrator` — exists in `backend/app/agents/orchestrator.py` but no API endpoint calls it | `backend/app/agents/orchestrator.py` | 🔲 Pending |
| 13 | Wire or remove `Composio` tools in chat agent — `build_composio_tools()` call is commented out in `tools.py` | `backend/app/agents/tool/tools.py` | 🔲 Pending |

---

## Bug Fixes & Correctness

| # | What | Where | Status |
|---|------|-------|--------|
| 14 | `meeting:audio-frame` IPC registered in two places (pipeline.ts + index.ts) — both fire per frame causing double `Float32Array` allocation for mic frames. Merge into one handler or document clearly. | `desktop/src/main/audio/pipeline.ts`, `desktop/src/main/index.ts` | ✅ Done |
| 15 | `backend/app/cli/commands/worker.py` still references `app.core.celery_app` which doesn't exist — update or remove CLI worker commands | `backend/app/cli/commands/worker.py` | ✅ Done |
| 16 | `embedding_service.py`'s `index_meeting()` is never called after meeting processing completes — vector search is fully built but Pinecone is never populated | `backend/app/services/meeting_processor.py`, `backend/app/services/embedding_service.py` | 🔲 Pending |
| 17 | `LLMService` has `meetingSessionId: null // TODO: wire to meeting session` in usage tracking | `desktop/src/main/llm/llm-service.ts` | ✅ Done |
| 18 | Contact form API route (`/api/contact`) has a TODO for email provider — currently logs but doesn't send | `frontend/src/app/api/contact/route.ts` | ✅ Done |

---

## Architecture Improvements

| # | What | Why | Status |
|---|------|-----|--------|
| 19 | Move Whisper inference to a **worker thread** (`worker_threads`) or Electron `utilityProcess` | Main process runs Whisper (GPU), LLM streaming, WebSocket server, screen recording all at once — Whisper inference can block the event loop during bursts causing UI jank | IGNORE its too slow |
| 20 | Extract `Overlay.tsx` state into a **React Context** (or Zustand/Jotai) — reduce prop drilling, add `React.memo` and `useMemo` to heavy children | Zustand `overlay-ui-store` + `MeetingDurationSync`; memo on ResponseCard, InputBar, ActionChips, TitleBar, CompactChatView, transcript panels | ✅ Done |
| 21 | Add a **concurrency semaphore + task persistence** to backend meeting processing | `asyncio.Task` in `task_runner.py` dies on restart, can't scale horizontally, CPU-heavy steps compete with API requests | ✅ Done |
| 22 | Add **WebSocket reconnection with exponential backoff** in Chrome extension | If WS drops mid-capture the extension just stops — no retry, no user notification | 🔲 Pending |
| 23 | Add a global concurrency limit in `task_runner.py` — multiple simultaneous uploads can starve the server without a cap | `backend/app/services/task_runner.py` | 🔲 Pending |

---

## Half-Built Features — Finish These

| # | What | Current State | Status |
|---|------|--------------|--------|
| 24 | **Re-enable VAD** (Voice Activity Detection) — Silero v5 is fully implemented but `_initVad()` is commented out in `pipeline.ts:init()` | Chunk-based fallback active, VAD disabled | ✅ Done |
| 25 | **Wire `index_meeting()`** after processing completes so Pinecone is populated and vector search actually works | `EmbeddingService` + `vector_search` tool built, never called | 🔲 Pending |
| 26 | **Upload progress** — add byte-level `onUploadProgress` callback for large video files | Upload queue has pending/uploading/success states but no percent bar | 🔲 Pending |
| 27 | **Contact form** — wire up Resend (already a `frontend` dependency) in `/api/contact` route | Resend + `CONTACT_INBOX_EMAIL` / `RESEND_API_KEY` | ✅ Done |
| 28 | **Web push notifications** require `VAPID_*` env vars to be set — document and validate on startup | Startup warning + docs if keys missing while reminders enabled | ✅ Done |

---

## Missing Features — High Value

| # | What | Effort | Status |
|---|------|--------|--------|
| 29 | **Desktop auto-update** via `electron-updater` — users currently re-download DMGs manually | Medium | ✅ Done |
| 30 | **Meeting export from web dashboard** — Markdown / PDF / JSON download from `MeetingReviewHeader` | Small | ✅ Done |
| 31 | **Transcript editing** in web dashboard — transcripts are read-only, no way to fix errors | Medium | ✅ Done |
| 32 | **Real-time speaker diarization** in desktop — currently only `"You"` vs `"Them"` based on audio source; multi-speaker identification is backend post-processing only | Large | 🔲 Pending |
| 33 | **Offline mode indicator** in desktop — LLM/sync fail silently when offline; show a clear status indicator | Small | 🔲 Pending |
| 34 | **Extension reconnection UX** — show "Reconnecting…" state with retry button in popup | Small | 🔲 Pending |
| 35 | **Calendar event → meeting auto-linking** in desktop — backend supports `calendarEventId` on upload but desktop doesn't fetch upcoming events or auto-link | Medium | ✅ Done |
| 36 | **Full-text search across all meetings** — meetings list API supports `search`, no search UI / command palette integration | Small–Medium | 🔲 Pending |

---

## Testing

| # | What | Current State | Status |
|---|------|--------------|--------|
| 37 | **Desktop tests** — set up vitest; start with `PromptAssembler`, `HeuristicDetector`, `TokenCounter`, audio resampling | Vitest + `npm test`; `linearResamplePcm` in `resample.ts` with tests; prompt/token/heuristic/resample suites | ✅ Done |
| 38 | **Backend test coverage** — expand from ~7 test files to cover meeting processor steps, calendar sync, auth middleware | Added `ClerkUser`, `_build_enriched` / transcript load, calendar webhook token tests; suite still growing vs full `app/` surface | ✅ Done |
| 39 | **Chrome extension tests** — at minimum, unit test `meeting-detector.js` regex patterns | `chrome-extension/package.json` + `meeting-detector.test.mjs` (`npm test`, Node built-in runner) | ✅ Done |
| 40 | **Frontend component tests** — React Testing Library for key components | Vitest + `marketing-chrome` helper tests; `shouldHideMarketingChrome` extracted to `src/lib/marketing-chrome.ts` | ✅ Done |
| 41 | **E2E tests** — Playwright for critical flows: sign-in → upload meeting → view in dashboard | Playwright + `e2e/home.spec.ts` (marketing home loads, title/nav); full auth→upload→dashboard flow still optional follow-up | ✅ Done |

---

## Developer Experience

| # | What | Status |
|---|------|--------|
| 42 | Add a root-level dev script that starts backend + desktop + extension in one command (e.g. `scripts/dev-all.sh` — file exists but check if it works end-to-end) | 🔲 Pending |
| 43 | Add a Alembic migration check to CI — ensure migrations are valid before merge | 🔲 Pending |
| 44 | Audit `ElectronAPI` interface in `types/index.ts` against `preload/index.ts` for drift — some optional-chained calls in hooks suggest methods may not always be present | 🔲 Pending |

---

## Future / Roadmap

| # | What | Effort |
|---|------|--------|
| 45 | **Real-time action items + meeting summary** generated at end of meeting | Medium |
| 46 | **Meeting templates / agendas** — configure AI focus per meeting type (standup, 1:1, interview) | Medium |
| 47 | **Team / org sharing** — share meetings with teammates, comment on transcripts | Large |
| 48 | **Windows support** — current app is macOS-only (ScreenCaptureKit, NSWindow, Metal) | Very Large |
| 49 | **Mobile companion app** — view transcripts and insights on phone during meetings | Large |

---

*Generated April 2026 — based on full codebase audit.*
