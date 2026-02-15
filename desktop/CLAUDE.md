# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Scribely Desktop is a macOS Electron overlay app that floats above all windows and is **invisible to screen sharing**. It provides AI chat, meeting transcription (local Whisper), and screen recording via a glassmorphism UI. No dock icon — runs silently in the background.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev mode with HMR |
| `npm run build` | Build main, preload, renderer for production |
| `npm run typecheck` | Type check all layers (main + renderer) |
| `npm run typecheck:main` | Type check main/preload only |
| `npm run typecheck:renderer` | Type check renderer only |
| `npm run build:native` | Build the Swift NativeHelper binary |
| `npm run build:proto` | Compile .proto files to TypeScript |
| `npm run build:all` | Proto + native + build (no packaging) |
| `npm run dist` | Full macOS DMG distribution |

No test framework is configured.

## Architecture

### Three-Process Model (Electron)

- **Main** (`src/main/`): App lifecycle, global hotkeys, audio pipeline (VAD + Whisper), WebSocket server for Chrome extension, native bridge to Swift daemon, IPC handlers, settings via electron-store.
- **Preload** (`src/preload/index.ts`): Secure IPC bridge via `contextBridge`. All renderer↔main communication goes through the `ElectronAPI` interface defined here and typed in `src/renderer/src/types/index.ts`.
- **Renderer** (`src/renderer/src/`): React 18 + Tailwind CSS + Framer Motion. State managed via hooks and Context (ThemeProvider). No Redux — IPC handles cross-process sync.

### Audio Pipeline (`src/main/audio/`)

Central to the app. Receives PCM audio frames from multiple sources, resamples to 16kHz, runs Silero VAD, then feeds speech segments to local Whisper transcription. Three capture modes:

1. **Native** (hybrid): System audio via SCStream (NativeHelper) + mic via browser getUserMedia
2. **Extension**: WebSocket bridge to Chrome extension (port 9876) for meeting audio
3. **Browser fallback**: Full browser-based capture when NativeHelper unavailable

### Native Bridge (`src/main/native-bridge.ts`)

Unix domain socket client connecting to a Swift daemon (NativeHelper) in `native/`. Communication serialized with Protobuf (message defs in `native/Proto/`, generated TS in `src/main/generated/`). Handles system audio capture via macOS ScreenCaptureKit.

### IPC Patterns

Three patterns used throughout:
- **invoke** (request/response): `get-settings`, `update-settings`, `take-screenshot`, `meeting:*`
- **send** (fire-and-forget): `send-message`, `streamAudioFrame`, `recording:write-chunk`
- **on** (event listening): `toggle-visibility`, `chat-response`, `meeting:transcript-entry`, `meeting:audio-levels`

### Screen-Share Invisibility (macOS)

Two native tricks via `nswindow-napi`:
1. `NSWindow.sharingType = .none` — hides from legacy capture APIs
2. `AssistiveTechHighWindowLevel` — avoids black rectangle artifact

### Theming

Themes defined in `src/renderer/src/themes/`, registered in `registry.ts`. All use CSS custom properties mapped through Tailwind (`tailwind.config.ts`). To add a theme: create a file, register it.

## Key Files

- `src/main/index.ts` — App entry, window creation, all IPC handler registration
- `src/main/hotkey.ts` — Global hotkey registration (default: Cmd+Shift+Space)
- `src/main/audio/pipeline.ts` — Audio processing orchestration
- `src/preload/index.ts` — Complete IPC API surface
- `src/renderer/src/types/index.ts` — ElectronAPI interface (source of truth for IPC types)
- `src/renderer/src/components/Overlay.tsx` — Main UI container (chat/settings/meeting views)
- `electron.vite.config.ts` — Build config (externals: nswindow-napi, smart-whisper, onnxruntime-node)

### Langfuse Observability

LLM calls (chat + background summarization) are traced to [Langfuse](https://langfuse.com) when `LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY` are set in `.env` (see `.env.example`). Instrumentation runs first in `src/main/instrumentation.ts`; the OpenAI client is wrapped with `observeOpenAI` in `LLMService`.

## Build Notes

- macOS only (depends on native modules: nswindow-napi, ScreenCaptureKit)
- Node >= 18 required
- NativeHelper Swift binary must be built separately (`npm run build:native`) and gets copied to `resources/native/`
- Proto compilation (`npm run build:proto`) must run before build if `.proto` files change
- TypeScript uses two configs: `tsconfig.node.json` (main/preload) and `tsconfig.web.json` (renderer)
