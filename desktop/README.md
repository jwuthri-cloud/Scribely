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
