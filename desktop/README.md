# Scribely Desktop

macOS-only Electron overlay app for real-time meeting assistance. Floats above all windows, invisible to screen sharing, with AI chat and live transcription (local Whisper).

## Requirements

- **macOS 13 (Ventura)** or later
- **Node.js 18+**
- **Apple Silicon (M1+)** recommended for best transcription performance

## Quick Start

```bash
npm install
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev mode with HMR |
| `npm run build` | Build main + preload + renderer |
| `npm run preview` | Preview production build |
| `npm run typecheck` | Type check all layers (main + renderer) |
| `npm run typecheck:main` | Type check main/preload only |
| `npm run typecheck:renderer` | Type check renderer only |
| `npm run build:native` | Build Swift NativeHelper binary → `resources/native/` |
| `npm run build:native:debug` | Build NativeHelper with debug symbols |
| `npm run build:proto` | Compile `.proto` files to TypeScript (run if `.proto` changes) |
| `npm run build:icon` | Generate app icon from extension icon |
| `npm run build:all` | Proto + native + build (no packaging) |
| `npm run dist` | Full macOS DMG distribution |
| `npm run build:extension` | Pack Chrome extension to zip (from repo root) |
| `npm run export:question-classifier` | Export ONNX question classifier model |

## Project Structure

```
desktop/
├── src/main/           # Main process (Node.js)
│   ├── index.ts        # App entry, IPC registration
│   ├── audio/          # Whisper pipeline, VAD, transcriber
│   ├── llm/            # OpenAI, Ollama, LM Studio
│   └── insights/       # Live insight detection
├── src/preload/        # IPC bridge (contextBridge)
├── src/renderer/       # React 18 + Tailwind frontend
├── native/             # Swift NativeHelper (ScreenCaptureKit)
└── resources/          # Native binary, icons, entitlements
```

## LLM Providers

- **OpenAI** — Best quality, requires API key
- **Ollama** — Free, local. Recommended: `ollama pull qwen3:1.7b`
- **LM Studio** — Free, local. Load Qwen3-1.7B-Instruct

## Live agent: Google Doc + standing task

**What it does.** During a meeting, Scribely keeps a Google Doc in the LLM's context and runs a *standing task* — an instruction you write once, e.g. *"log every praise as '@name — what for'"* — over the transcript every N seconds. Each result shows up as a **task** card in Live Insights and, if you turn it on, is **inserted into the doc** at the line the agent picks (insert-only; the rest of the doc is never touched).

### The three pieces — don't mix them up

| Piece | What it is | Where |
|-------|------------|-------|
| **Standing task** | The prompt. *What* to extract. | Typed in the app (see *Where the settings are*) |
| **The doc** | *Where* results go, and context the agent reads (it sees its own earlier notes and won't repeat them). Headings in it just give the agent lines to file things under; an empty doc works too — everything appends at the end. | A real Google Doc, **or** a local file standing in for it while testing |
| **Transcript** | The meeting audio. In tests, a text file the simulator reads aloud with macOS `say`, transcribed by real Whisper. | `test_transcript.txt` (Google Meet export, works as-is) |

### Where the settings are

In the desktop app: **gear icon** (Settings) → a **sliders icon** appears in the title bar (tooltip *Insights settings*) → scroll to the bottom → **LIVE AGENT**.

| Field | Put |
|-------|-----|
| Google Doc to follow | The doc's URL. For offline tests any Docs-shaped URL, e.g. `https://docs.google.com/document/d/test/edit` |
| Standing task | Your instruction, plain English |
| Write results into the doc | **On** if you want the doc edited, otherwise you only get cards |
| Task interval (s) / Doc poll (s) | How often the task runs / the doc is re-read. Min 5. Each task run is one LLM call. |
| Status line + **Sync now** | Char count, last sync time, last write result, or the error |

---

### Test it end to end — Path A: offline, no Google account needed

Everything below is run **from the `desktop/` folder**. Three terminals.

**Step 1 — files.**

```bash
cd desktop
cat > notes.md <<'EOF'
Praise log
Decisions
Action items
EOF
```

`notes.md` is your fake Google Doc. Put whatever headings match your task (or leave it empty). `test_transcript.txt` is already in this folder.

**Step 2 — terminal 1: start Scribely, pointed at the fake doc.**

```bash
cd desktop
SCRIBELY_DOCS_API_URL=http://127.0.0.1:9878 SCRIBELY_GOOGLE_TOKEN=x npm run dev
```

The two variables redirect Google Docs API calls to the simulator and skip the backend token fetch. **Only for this test** — never set them normally. OpenAI key must be set in the app's LLM tab.

**Step 3 — terminal 2: start the simulator.** This creates the fake doc API and the meeting.

```bash
cd desktop
node scripts/simulate.mjs test_transcript.txt --doc notes.md --speed 2
```

Expected output: `connected — meeting auto-started`, `fake Docs API on http://127.0.0.1:9878`, then `▶ <line>` for every line spoken. Scribely starts a meeting on its own.

**Step 4 — in the app: fill the Live agent settings** (location above).

- Google Doc to follow: `https://docs.google.com/document/d/test/edit`
- Standing task: e.g. `Log every praise given to someone as "@name — what for", under Praise log. Log decisions and action items under their headings.`
- Write results into the doc: **on**
- Click **Sync now** → status must read `Synced N chars via Google account at HH:MM`. If it says `cannot reach http://127.0.0.1:9878` the simulator (step 3) isn't running.

**Step 5 — terminal 3: watch the doc change.**

```bash
cd desktop
tail -f notes.md
```

Within one task interval of relevant speech you get a task card in the app, `· last write ok` on the status line, a `doc write: "…"` line in terminal 2, and the new line under the heading in terminal 3. Edit `notes.md` yourself and save — the agent sees it on the next poll.

**Step 6 — stop.** Ctrl+C in terminal 2 ends the meeting. Transcript JSON lands in `~/Documents/Scribely/recordings/`.

53 minutes of transcript ≈ 21 min at `--speed 2`. Use `--speed 4` just to see it work.

---

### Path B: a real Google Doc

One-time setup:

1. **Clerk dashboard** → SSO connections → Google → custom credentials → add scope `https://www.googleapis.com/auth/documents`.
2. **Backend running** with `CLERK_SECRET_KEY`: `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000`.
3. `desktop/.env` has `BACKEND_API_URL=http://localhost:8000` and **does not** have the two `SCRIBELY_DOCS_*` variables.
4. `cd desktop && npm run dev` (plain), then sign out and back in **with Google** so the new scope gets consented.

Then:

5. Create a Google Doc, paste its URL in *Google Doc to follow*, **Sync now** → `Synced N chars via Google account`. `403` = scope missing in Clerk. `404 No Google OAuth token` = not signed in with Google.
6. Terminal: `cd desktop && node scripts/simulate.mjs test_transcript.txt --speed 2` — **no `--doc`**, the real doc is the doc.
7. Keep the Doc open in the browser and watch lines get inserted. Safe to type in it at the same time: every write is guarded by the doc's revision id and retried if you edited in between.

### Which simulator command

| The doc is… | Command (from `desktop/`) | Scribely started with |
|-------------|---------------------------|-----------------------|
| a local file (Path A) | `node scripts/simulate.mjs test_transcript.txt --doc notes.md --speed 2` | the two `SCRIBELY_DOCS_*` vars |
| a real Google Doc (Path B) | `node scripts/simulate.mjs test_transcript.txt --speed 2` | plain `npm run dev` |

Any `.txt`/`.md` is read line by line (`[00:01:12]`, `John Raptis:` prefixes stripped, blank lines skipped). Any other file (`.mp3`, `.mp4`, `.webm`) is decoded with ffmpeg and streamed as-is. Needs `ffmpeg` (`brew install ffmpeg`). Everything arrives as "Them"; Whisper transcribes the synthesized voice, so the app's text won't match the file word for word.

### Troubleshooting

| Symptom | Cause |
|---------|-------|
| `Cannot find module '…/scripts/simulate.mjs'` | You're not in `desktop/`. `cd desktop` first. |
| `cannot reach ws://127.0.0.1:9876` | Scribely isn't running |
| Status: `cannot reach http://127.0.0.1:9878 (ECONNREFUSED)` | Path A: simulator not running, or started without `--doc` |
| Status: `BACKEND_API_URL not configured` / `No session token` | Path A: Scribely wasn't started with the two env vars. Path B: backend/sign-in missing. |
| `403` on Sync now (Path B) | `documents` scope not on the Clerk Google connection |
| Cards appear but nothing written | *Write results into the doc* is off, or status shows a write error |
| Status: `Doc is ~N tokens; <model> handles …` | Doc bigger than the model's context — switch to gpt-5.6-sol / Gemini or trim it |
| No transcript at all | Whisper model still downloading on first run — check the app log |

### How it works under the hood

- **Read** — `src/main/doc-sync.ts` polls `documents.get` with the user's Google token (backend `GET /api/v1/integrations/google/token`, resolved from Clerk) while a meeting is active. @-mention chips come back resolved to names.
- **Task** — `src/main/insights/live-task.ts` buffers transcript lines and every interval calls the LLM with the task; the doc rides in the system prompt so prefix caching absorbs it between doc changes. The model answers `{"note": …, "after": "<verbatim doc line to insert after>"}` or `{"note": null}`.
- **Write** — `src/main/google-docs.ts` re-fetches the doc for its current layout and `revisionId`, then one `batchUpdate` inserting a new paragraph after the anchor (falling back to end of doc), guarded by `writeControl.requiredRevisionId`; on conflict it refetches and retries once. Google has no push for Docs, so "realtime" = the poll interval.

## Build for Distribution

```bash
npm run dist
```

Outputs land in `desktop/dist/`, including:

| Artifact | Role |
|----------|------|
| **DMG** | Manual install (drag to Applications) |
| **ZIP** + **`latest-mac.yml`** | Used by **in-app auto-update** (`electron-updater` on macOS uses the zip + update metadata, not the DMG) |

Signing and notarization use Apple Developer credentials from the environment (see `desktop/.env.example`).

### Auto-updates (how it works)

1. **`electron-updater`** runs only in a **packaged** app (`app.isPackaged`). Dev (`npm run dev`) does not check for updates.
2. **Update feed** is baked in at build time from `package.json` → `build.publish`. This repo points the feed at GitHub Releases on **[Scribely-Release](https://github.com/Jwuthri/Scribely-Release/releases)** (`owner` / `repo`), not the main application source repo. The app downloads `latest-mac.yml` and the referenced **zip** (and blockmap when present) from that release.
3. **After launch**, the main process schedules a check about **15 seconds** later so startup stays fast. Downloads happen in the background. When an update is ready, the user gets a **native dialog** (Restart / Later) and can also use **Settings → App updates** or the tray **Check for Updates…** (packaged builds only).
4. **Quit and install**: `autoInstallOnAppQuit` is enabled; users can also restart immediately from the dialog or from Settings when a downloaded update is pending.
5. **Disable** auto-update checks (e.g. debugging a packaged build): set `SCRIBELY_DISABLE_AUTO_UPDATE=1` in the environment (see `desktop/.env.example`).

### Releasing a new desktop version

1. Bump **`version`** in `desktop/package.json` (semver must increase vs the last public release).
2. Run `npm run dist` with signing/notarization configured.
3. Create a **GitHub Release** on **Scribely-Release** for that tag and attach the **`dist/`** artifacts electron-builder produced (at minimum the **zip**, **`latest-mac.yml`**, and blockmap files for differential updates—`electron-builder --publish` can upload them if `GH_TOKEN` is set).

Users who installed an **older** build that pointed at a different `publish` repo will follow the **old** feed until they install a build that contains the current `build.publish` settings.
