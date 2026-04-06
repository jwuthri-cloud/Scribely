# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Scribely is a macOS-only desktop overlay + Chrome extension system for real-time meeting assistance. The **desktop app** (Electron) floats above all windows, is invisible to screen sharing, and provides AI chat with live meeting transcription (local Whisper). The **Chrome extension** captures tab audio/video from browser meetings and streams it to the desktop app over a local WebSocket. Together, they enable: live transcription, AI-powered Q&A against the transcript, meeting recording, and real-time insight detection.

## Repository Layout (Desktop + Chrome Extension)

```
desktop/                          # Electron overlay app (macOS only)
├── src/main/                     # Main process (Node.js)
│   ├── index.ts                  # App entry: window creation, IPC registration, lifecycle
│   ├── hotkey.ts                 # Global hotkey registration (Alt+T, Alt+M, etc.)
│   ├── invisibility.ts           # NSWindow screen-share hiding
│   ├── native-bridge.ts          # Unix socket client → Swift NativeHelper daemon
│   ├── ws-server.ts              # WebSocket server (port 9876) for Chrome extension
│   ├── screen-recorder.ts        # Screen recording via ScreenCaptureKit
│   ├── screenshot.ts             # Screenshot capture
│   ├── instrumentation.ts        # Langfuse/OpenTelemetry setup (must be first import)
│   ├── audio/                    # Audio processing pipeline
│   │   ├── pipeline.ts           # Central orchestrator: VAD + Whisper + frame routing
│   │   ├── transcriber.ts        # Local Whisper transcription wrapper
│   │   ├── vad.ts                # Silero VAD (voice activity detection)
│   │   └── model-manager.ts      # Whisper/VAD model download + caching
│   ├── llm/                      # LLM integration (OpenAI API direct)
│   │   ├── llm-service.ts        # Chat, streaming, system prompts, usage tracking
│   │   ├── prompt-assembler.ts   # Append-only prompt strategy for prefix caching
│   │   ├── token-counter.ts      # Token counting utility
│   │   ├── transcript-memory.ts  # Transcript summarization state
│   │   ├── background-summarizer.ts # Async transcript summarization
│   │   └── web-search.ts         # Web search for Live Insights
│   └── insights/                 # Live Insights feature
│       ├── insight-engine.ts     # Orchestrator: detection → validation → enrichment → emit
│       ├── heuristic-detector.ts # Zero-cost regex pattern matching on transcript entries
│       └── types.ts              # Shared insight types
├── src/preload/index.ts          # Secure IPC bridge (contextBridge) — defines ElectronAPI
├── src/renderer/src/             # React 18 frontend
│   ├── components/
│   │   ├── Overlay.tsx           # Root UI: orchestrates chat, meeting, settings views
│   │   ├── CompactChatView.tsx   # Compact mode layout
│   │   ├── LiveTranscriptPanel.tsx # Live transcript display during meetings
│   │   ├── LiveInsightsPanel.tsx # Real-time insight cards during meetings
│   │   ├── InputBar.tsx          # Chat input with model selector, summarize button
│   │   ├── ResponseCard.tsx      # Chat message display with markdown
│   │   ├── SettingsView.tsx      # Settings panel
│   │   └── LLMView.tsx          # LLM configuration panel
│   ├── hooks/
│   │   ├── useChat.ts            # Chat state + streaming LLM + transcript delta embedding
│   │   ├── useAudioCapture.ts    # Tri-mode audio: extension → native → browser fallback
│   │   ├── useMeetingTranscript.ts # Transcript entry state management
│   │   ├── useMeetingRecorder.ts # Screen recording control
│   │   ├── useLiveInsights.ts    # Insight state + action execution
│   │   └── useWhisperSTT.ts     # Push-to-talk speech-to-text for chat input
│   ├── types/
│   │   ├── index.ts              # ElectronAPI interface (source of truth for IPC types)
│   │   ├── settings.ts           # AppSettings, ModelConfig, all settings types + defaults
│   │   ├── insights.ts           # Insight types (renderer-side)
│   │   └── transcript.ts         # Transcript types
│   └── themes/                   # Theme definitions (CSS custom properties via registry.ts)
├── native/                       # Swift NativeHelper daemon (ScreenCaptureKit)
│   └── Proto/                    # Protobuf message definitions
├── electron.vite.config.ts       # Build config (externals: nswindow-napi, smart-whisper, onnxruntime-node)
└── package.json

chrome-extension/                 # Manifest V3 Chrome extension (plain JS, no build step)
├── manifest.json                 # Permissions: tabCapture, offscreen, activeTab
├── background.js                 # Service worker: lifecycle, offscreen document management
├── popup.html / popup.js         # Extension popup: connection status, start/stop capture
├── offscreen.html / offscreen.js # Hidden document: media capture, WebSocket streaming
├── permissions.html / permissions.js # Mic permission request page
├── pcm-worklet.js                # AudioWorklet: extracts 16kHz PCM from tab audio
└── pcm-injector-worklet.js       # AudioWorklet: upsamples Electron-relayed mic PCM
```

## Commands

All commands run from `desktop/`:

```bash
npm install                # Install dependencies
npm run dev                # Dev mode with HMR
npm run build              # Build main + preload + renderer
npm run typecheck          # Type check all layers (main + renderer)
npm run typecheck:main     # Type check main/preload only
npm run typecheck:renderer # Type check renderer only
npm run build:native       # Build Swift NativeHelper binary → resources/native/
npm run build:proto        # Compile .proto files to TypeScript (run if .proto changes)
npm run build:all          # Proto + native + build (no packaging)
npm run dist               # Full macOS DMG distribution
```

No test framework is configured. The Chrome extension has no build step — loaded as unpacked extension in Chrome.

## Architecture

### Three-Process Electron Model

- **Main** (`src/main/`): Node.js process. Owns AudioPipeline, LLMService, InsightEngine, ExtensionWsServer, NativeBridge, ScreenRecorder, electron-store settings, global hotkeys. All IPC handlers registered here.
- **Preload** (`src/preload/index.ts`): Secure bridge via `contextBridge`. Every renderer↔main call goes through the `ElectronAPI` object exposed as `window.electronAPI`.
- **Renderer** (`src/renderer/src/`): React 18 + Tailwind CSS + Framer Motion. State via hooks and Context (no Redux). All data access through `window.electronAPI`.

### IPC Communication

Three IPC patterns:


| Pattern  | Direction                  | Example                                                     | Usage                                   |
| -------- | -------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| `invoke` | renderer → main → renderer | `llm:set-model`, `meeting:start-session`                    | Request/response (returns Promise)      |
| `send`   | renderer → main            | `llm:chat`, `update-settings`, `meeting:audio-frame`        | Fire-and-forget (no return)             |
| `on`     | main → renderer            | `llm:chat-delta`, `meeting:transcript-entry`, `insight:new` | Event listener (returns unsubscribe fn) |


**When adding a new IPC channel, update three files:**

1. `src/main/index.ts` (or the owning service) — register handler with `ipcMain.handle()` or `ipcMain.on()`
2. `src/preload/index.ts` — expose via `ipcRenderer.invoke()`, `.send()`, or `.on()`
3. `src/renderer/src/types/index.ts` — add to the `ElectronAPI` interface

### Audio Pipeline (`src/main/audio/pipeline.ts`)

Central audio orchestrator. Receives PCM frames from three sources, resamples to 16kHz, feeds to local Whisper.

**Three capture modes** (priority: extension > native > browser):

1. **Extension** — Chrome extension captures tab audio via `tabCapture` API, streams 16kHz PCM over WebSocket (port 9876). Mic captured separately by renderer `getUserMedia`.
2. **Native (hybrid)** — System audio via Swift NativeHelper (ScreenCaptureKit/SCStream over Unix socket). Mic via renderer `getUserMedia`. Best quality, avoids Bluetooth HFP degradation.
3. **Browser fallback** — Both mic and system audio via browser APIs (`getUserMedia` + `getDisplayMedia`). Used when NativeHelper unavailable and no extension connected.

**Audio processing flow:**

```
PCM frames (any source) → resample to 16kHz → energy gate (mic only, drop if RMS < 0.005)
  → chunk accumulation (2s configurable) → Whisper transcription → transcript entry → renderer
```

VAD (Silero) is currently **disabled** — chunk-based pipeline is active. To re-enable: uncomment `await this._initVad()` in `pipeline.ts:init()`.

Whisper models: `local-fast` (small.en ~488MB), `local-balanced` (medium.en ~1.5GB), `local-accurate` (large-v3-turbo ~1.6GB). Auto-downloaded on first use.

### LLM Service (`src/main/llm/llm-service.ts`)

Uses **OpenAI SDK directly** (not OpenRouter or LangChain). Three models: `gpt-5-nano`, `gpt-5-mini`, `gpt-5.2` — nano/mini 400k context, 128k max response; `gpt-5.2` uses 1.05M context in-app.

**Append-only prompt strategy** (optimized for OpenAI prefix caching):

- System prompt is always `messages[0]` — stable, never changes → perfect cache prefix
- Each user message embeds its transcript delta inline using XML tags:
  ```
  <transcript>
  NEW TRANSCRIPT SINCE LAST MESSAGE:
  [0:42] Them: What's the timeline?
  [0:45] You: End of Q2.
  </transcript>

  <user_query>
  What deadlines were mentioned?
  </user_query>
  ```
- Messages are strictly append-only — old messages never modified
- Transcript summary (from background summarization) prepended to LAST user message only
- When context overflows, oldest user+assistant pairs dropped from front
- `prompt_cache_key` per session ID enables cross-request prefix caching

**Background summarization**: Auto-triggers when transcript volume exceeds 40% of context budget and summary is stale (>5min). Uses gpt5-mini. Controlled by `llm.summarization.`* settings.

**API key**: Encrypted via Electron `safeStorage`, stored in `electron-store`. Plain-text keys auto-migrated to encrypted on first read.

### Chrome Extension ↔ Desktop Communication

Local WebSocket at `ws://127.0.0.1:9876` (`ExtensionWsServer` in `src/main/ws-server.ts`).

**Binary protocol** (1-byte type header + payload):


| Byte   | Type        | Direction      | Payload                                                  |
| ------ | ----------- | -------------- | -------------------------------------------------------- |
| `0x01` | Audio PCM   | ext → Electron | Float32Array (16kHz)                                     |
| `0x02` | Video chunk | ext → Electron | WebM blob (VP9/VP8 + Opus)                               |
| `0x03` | Control     | bidirectional  | JSON string (`hello`, `stop-capture`, `capture-stopped`) |
| `0x04` | Mic PCM     | Electron → ext | Float32Array (16kHz) — fallback mic relay                |


**Connection lifecycle:**

1. Extension popup checks Electron connectivity (opens WS, immediately closes)
2. User clicks "Start Sharing" → `background.js` gets `tabCapture` stream ID
3. Creates offscreen document → `offscreen.js` captures tab media + connects WS
4. Sends `{ type: 'hello', source: 'chrome-extension', sampleRate: 16000 }` control message
5. `ExtensionWsServer` emits `connected` → Electron auto-starts meeting session
6. Audio PCM streamed at 16kHz via AudioWorklet (`pcm-worklet.js`)
7. Video chunks streamed via MediaRecorder (VP9, 2.5 Mbps, 1s intervals)
8. On stop: extension sends `capture-stopped` control → server emits `disconnected` → Electron auto-stops meeting

**Mic fallback**: If offscreen document can't get mic permission, Electron captures mic via renderer `getUserMedia`, relays PCM frames back to extension (MSG_MIC `0x04`). `pcm-injector-worklet.js` upsamples 16kHz → native rate via ring buffer + linear interpolation, mixes into WebM recording.

### Live Insights (`src/main/insights/`)

Real-time event detection from transcript entries:

1. **HeuristicDetector** — zero-cost regex matching per entry. Detects: questions (question words + `?`), action items ("we should", "I'll", "please"), decisions ("agreed", "let's go with"), topic changes (Jaccard similarity < 0.15 vs recent window), key mentions ($amounts, dates, URLs, capitalized entities).
2. **InsightEngine** — orchestrates: detection → debounce (10s per type) → LLM validation (questions only, gpt5-nano confirms it's a real question) → optional LLM enrichment (title/description/suggested actions) → emit `insight:new` to renderer.
3. Settings-configurable: enable/disable per detector type, custom question keywords, enrichment toggle.

### Screen-Share Invisibility (macOS)

Two native tricks via `nswindow-napi`:

1. `NSWindow.sharingType = .none` — hides from legacy capture APIs
2. `AssistiveTechHighWindowLevel` — avoids black rectangle artifact

Window starts invisible (content protection on). Togglable via `toggle-invisibility` IPC. Dock icon hidden.

### Settings & Persistence

All settings via `electron-store` (auto-persisted JSON). Schema: `AppSettings` type in `src/renderer/src/types/settings.ts`.

Key settings groups:

- **UI**: `themeId`, `windowOpacity`, `fontSize`, `compactMode`, `hotkeys.`*
- **Transcription**: `transcription.provider` (local-fast/balanced/accurate), `transcription.chunkDurationSec`
- **LLM**: `llm.apiKey` (encrypted), `llm.defaultModel`, `llm.temperature`, `llm.systemPrompts[]`, `llm.activeSystemPromptId`
- **Summarization**: `llm.summarization.autoSummarizeEnabled`, `stalenessMinutes`, `thresholdPercent`, `keepRawCount`
- **Insights**: `llm.insights.enabled`, `enrichmentEnabled`, per-detector toggles, `extraQuestionKeywords`
- **Quick Actions**: `llm.quickActions[]` (unlimited, shown as chips in chat)

Settings flow: renderer calls `updateSettings(partial)` → main deep-merges into store → re-registers hotkeys if changed → applies window opacity → notifies renderer via `settings-changed` event.

### Theming

Themes in `src/renderer/src/themes/`, registered in `registry.ts`. CSS custom properties (`--surface`, `--text`, `--accent`, `--border`, `--overlay`, etc.) mapped through Tailwind config. To add a theme: create a theme file, register it.

## Build Notes

- **macOS only** — depends on ScreenCaptureKit, NSWindow APIs, Metal (for Whisper inference)
- **Node >= 18** required
- **NativeHelper** Swift binary built separately (`npm run build:native`) → copied to `resources/native/`
- **Proto compilation** (`npm run build:proto`) must run before build if `.proto` files change
- **TypeScript**: two configs — `tsconfig.node.json` (main/preload) and `tsconfig.web.json` (renderer)
- **Native module externals** in Vite: `nswindow-napi`, `smart-whisper`, `onnxruntime-node`
- **Langfuse observability** (optional): set `LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY` in `desktop/.env` (see `.env.example`). All OpenAI calls traced. `src/main/instrumentation.ts` must be first import in `index.ts`.
- **Recordings & transcripts** saved to `~/Documents/Scribely/recordings/`

## Data Flow: End-to-End Meeting

```
1. User starts meeting (Alt+M hotkey or UI button)
2. useAudioCapture determines mode (extension > native > browser)
3. Audio frames stream to AudioPipeline in main process
4. Pipeline: resample 16kHz → energy gate → 2s chunk accumulation → Whisper
5. Transcript entries emitted to renderer (meeting:transcript-entry)
6. InsightEngine: heuristic detection → debounce → LLM validation → enrichment → insight:new
7. useChat embeds transcript deltas in user messages (<transcript> XML tags)
8. User asks question → PromptAssembler fits within 400k context → OpenAI streaming
9. Background summarizer auto-triggers if transcript > 40% of context budget
10. Meeting stop → flush pipeline → save transcript JSON + WebM recording → ~/Documents/Scribely/
```

