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

Produces a signed DMG in `dist/`. Requires Apple Developer credentials for notarization.
