# Scribely — Project Architecture

> Real-time AI meeting assistant: **Desktop overlay** (Electron) + **Chrome extension** (tab capture) + **Web app** (Next.js) + **Backend API** (FastAPI) + **Native daemon** (Swift)

---

## Table of Contents

- [System Overview](#system-overview)
- [Repository Layout](#repository-layout)
- [Application Map](#application-map)
  - [Desktop App (Electron)](#1-desktop-app-electron)
  - [Desktop auto-updates](#desktop-auto-updates)
  - [Chrome Extension](#2-chrome-extension)
  - [Backend API (FastAPI)](#3-backend-api-fastapi)
  - [Web App (Next.js)](#4-web-app-nextjs)
  - [Native Daemon (Swift)](#5-native-daemon-swift)
- [Cross-App Communication](#cross-app-communication)
- [Data Flow Diagrams](#data-flow-diagrams)
  - [Meeting Lifecycle](#meeting-lifecycle-end-to-end)
  - [Audio Pipeline](#audio-pipeline)
  - [LLM Chat Flow](#llm-chat-flow)
  - [Meeting Sync to Backend](#meeting-sync--upload)
- [Protocol Reference](#protocol-reference)
  - [WebSocket Binary Protocol](#websocket-binary-protocol-desktop--extension)
  - [Unix Socket Protobuf Protocol](#unix-socket-protobuf-protocol-desktop--native)
  - [IPC Channel Reference](#ipc-channel-reference-electron)
  - [REST API Endpoints](#rest-api-endpoints-backend)
- [Database Schema](#database-schema)
- [Authentication Flow](#authentication-flow)
- [Infrastructure & Deployment](#infrastructure--deployment)
- [Technology Stack](#technology-stack)
- [Configuration & Environment](#configuration--environment)

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              USER'S MACHINE (macOS)                              │
│                                                                                  │
│  ┌──────────────────────┐    WebSocket (9876)    ┌──────────────────────┐        │
│  │   Desktop Overlay    │◄══════════════════════►│   Chrome Extension   │        │
│  │     (Electron)       │   PCM/Video/Control    │    (Manifest V3)    │        │
│  │                      │                        │                      │        │
│  │  • Live Transcript   │                        │  • Tab Audio Capture │        │
│  │  • AI Chat (OpenAI)  │                        │  • Video Recording   │        │
│  │  • Live Insights     │                        │  • Meeting Detection │        │
│  │  • Screen Recording  │                        └──────────────────────┘        │
│  │  • Invisibility      │                                                        │
│  └─────────┬────────────┘                                                        │
│            │ Unix Socket (protobuf)                                              │
│  ┌─────────▼────────────┐                                                        │
│  │  NativeHelper Daemon │                                                        │
│  │       (Swift)        │                                                        │
│  │  • ScreenCaptureKit  │                                                        │
│  │  • System Audio      │                                                        │
│  └──────────────────────┘                                                        │
└────────────────────┬─────────────────────────────────────────────────────────────┘
                     │ HTTPS (Bearer JWT)
                     ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                  CLOUD                                           │
│                                                                                  │
│  ┌──────────────────────┐     REST API      ┌──────────────────────┐            │
│  │    Web App           │◄═════════════════►│    Backend API       │            │
│  │    (Next.js)         │                    │    (FastAPI)         │            │
│  │                      │                    │                      │            │
│  │  • Dashboard         │                    │  • Meeting Storage   │            │
│  │  • Meeting History   │                    │  • AI Processing     │            │
│  │  • Calendar Sync     │                    │  • Diarization       │            │
│  │  • Marketing Site    │                    │  • Calendar Sync     │            │
│  └──────────────────────┘                    │  • Web Push          │            │
│                                              └──────────┬───────────┘            │
│           ┌──────────────────────┬───────────────────────┤                        │
│           ▼                      ▼                       ▼                        │
│   ┌──────────────┐      ┌──────────────┐       ┌──────────────┐                 │
│   │  PostgreSQL  │      │    Clerk     │       │  OpenRouter  │                 │
│   │  (Railway)   │      │   (Auth)     │       │  (LLMs)      │                 │
│   └──────────────┘      └──────────────┘       └──────────────┘                 │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Repository Layout

```
assistme/
├── desktop/                    # Electron overlay app (macOS)
│   ├── src/main/               # Main process (Node.js)
│   ├── src/preload/            # Secure IPC bridge
│   ├── src/renderer/src/       # React 18 UI
│   └── native/                 # Swift NativeHelper daemon
├── chrome-extension/           # MV3 Chrome extension (plain JS)
├── backend/                    # FastAPI server (Python 3.13)
├── frontend/                   # Next.js 14 web app
├── promo-video/                # Remotion promo video project
├── scribely-apex-redirect/     # Vercel apex domain redirect
├── scripts/                    # Dev utilities
├── docker-compose.yml          # Full-stack local dev
└── .github/workflows/          # CI/CD (tests, version bumps)
```

---

## Application Map

### 1. Desktop App (Electron)

The core product. A **macOS-only** floating overlay that's invisible to screen sharing, providing live transcription, AI chat, and real-time insights during meetings.

#### Three-Process Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MAIN PROCESS (Node.js)                │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ AudioPipeline│  │  LLMService  │  │InsightEngine │  │
│  │  • Whisper   │  │  • OpenAI    │  │  • Heuristic │  │
│  │  • VAD       │  │  • Streaming │  │  • LLM Valid │  │
│  │  • Resample  │  │  • Summarize │  │  • Enrich    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ExtWsServer  │  │ NativeBridge │  │ScreenRecorder│  │
│  │  • Port 9876 │  │  • UDS Proto │  │  • Capture   │  │
│  │  • Binary WS │  │  • SCKit     │  │  • Save      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  AuthService │  │BackendClient │  │ electron-store│  │
│  │  • Clerk     │  │  • Sync API  │  │  • Settings  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────┤
│                  PRELOAD (contextBridge)                 │
│              window.electronAPI → IPC bridge             │
├─────────────────────────────────────────────────────────┤
│                  RENDERER (React 18 + Tailwind)          │
│                                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Overlay (root)                                     │  │
│  │  ├─ AuthGate / OnboardingView                     │  │
│  │  ├─ TitleBar (nav, meeting pill, panels)          │  │
│  │  ├─ CompactChatView / ResponseCard                │  │
│  │  ├─ LiveTranscriptPanel / LiveTranscriptSidePanel │  │
│  │  ├─ LiveInsightsSidePanel                         │  │
│  │  ├─ InputBar (model picker, STT, screenshot)      │  │
│  │  ├─ SettingsView / LLMView / InsightsView         │  │
│  │  └─ MeetingSyncHistoryView                        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                         │
│  Hooks: useChat, useAudioCapture, useMeetingTranscript,  │
│         useMeetingRecorder, useLiveInsights, useWhisperSTT│
└─────────────────────────────────────────────────────────┘
```

#### Key Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **AudioPipeline** | `src/main/audio/pipeline.ts` | Central audio orchestrator: receives PCM from 3 sources, resamples to 16kHz, chunks, feeds Whisper |
| **Transcriber** | `src/main/audio/transcriber.ts` | Local Whisper (smart-whisper + Metal GPU) with cloud fallback (Deepgram) |
| **VAD** | `src/main/audio/vad.ts` | Silero v5 voice activity detection (currently disabled; chunk-based active) |
| **ModelManager** | `src/main/audio/model-manager.ts` | Downloads/caches Whisper + VAD ONNX models to `userData/models/` |
| **LLMService** | `src/main/llm/llm-service.ts` | OpenAI SDK direct, streaming, multi-model, encrypted API key |
| **PromptAssembler** | `src/main/llm/prompt-assembler.ts` | Append-only prompt strategy optimized for OpenAI prefix caching |
| **BackgroundSummarizer** | `src/main/llm/background-summarizer.ts` | Auto-summarizes transcript when >40% of context budget |
| **InsightEngine** | `src/main/insights/insight-engine.ts` | Orchestrates heuristic detection → debounce → LLM validation → enrichment |
| **HeuristicDetector** | `src/main/insights/heuristic-detector.ts` | Zero-cost regex: questions, action items, decisions, topics, key mentions |
| **ExtensionWsServer** | `src/main/ws-server.ts` | WebSocket server for Chrome extension at `ws://127.0.0.1:9876` |
| **NativeHelperBridge** | `src/main/native-bridge.ts` | Unix socket + protobuf communication with Swift daemon |
| **ScreenRecorder** | `src/main/screen-recorder.ts` | Screen/window recording via ScreenCaptureKit |
| **AuthService** | `src/main/auth/auth-service.ts` | Clerk sign-in, session tokens, encrypted storage |
| **BackendClient** | `src/main/backend-client.ts` | Uploads meetings (transcript + video) to FastAPI backend |
| **Auto-update** | `src/main/updater.ts` | `electron-updater`: GitHub Releases feed, background download, restart to install |

#### Desktop auto-updates

End users install from a **signed DMG**; ongoing updates use **`electron-updater`**, which on macOS pulls **`latest-mac.yml`** and the **ZIP** artifacts from a **GitHub Releases** repository configured in `desktop/package.json` under **`build.publish`** (currently **[Jwuthri/Scribely-Release](https://github.com/Jwuthri/Scribely-Release/releases)**—a dedicated release repo, separate from the main source tree).

| Step | What happens |
|------|----------------|
| Build | `electron-builder` produces DMG (manual install) + ZIP + `latest-mac.yml` (update channel). The publish target is embedded for the updater’s feed URL. |
| Runtime | Packaged app only: delayed check (~15s after launch), optional manual check from **Settings → App updates** or tray **Check for Updates…**. Dev builds skip the updater. |
| New version | User is prompted when a download completes; restart applies the update (or install on next quit). |
| Opt-out | `SCRIBELY_DISABLE_AUTO_UPDATE=1` disables checks. |

Older installed builds keep using whatever **`publish`** configuration was compiled into them until the user installs a newer build.

#### Audio Capture Modes (Priority Order)

| Mode | Source | Mic | Tab/System Audio | Video |
|------|--------|-----|------------------|-------|
| **Extension** | Chrome extension WS | Browser `getUserMedia` | Tab capture via `tabCapture` API | Extension MediaRecorder |
| **Native (Hybrid)** | Swift NativeHelper | Browser `getUserMedia` | ScreenCaptureKit (SCStream) | Desktop ScreenRecorder |
| **Browser Fallback** | Browser APIs | `getUserMedia` | `getDisplayMedia` | Desktop ScreenRecorder |

#### Whisper Models

| ID | Model | Size | Use Case |
|----|-------|------|----------|
| `local-fast` | small.en | ~488 MB | Quick transcription, English only |
| `local-balanced` | medium.en | ~1.5 GB | Good quality, English only |
| `local-accurate` | large-v3-turbo | ~1.6 GB | Best quality, multilingual |

#### LLM Models (Desktop Direct — OpenAI)

| Model | Context Window | Max Response |
|-------|---------------|--------------|
| `gpt-5.6-luna` | 400K tokens | 128K tokens |
| `gpt-5.6-terra` | 400K tokens | 128K tokens |
| `gpt-5.6-sol` | 1.05M tokens | 128K tokens |

---

### 2. Chrome Extension

A **Manifest V3** Chrome extension that captures tab audio/video from browser-based meetings and streams to the desktop app over a local WebSocket.

#### Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION                        │
│                                                           │
│  ┌─────────────┐  messages  ┌───────────────────────────┐ │
│  │   Popup     │◄══════════►│   Background SW           │ │
│  │  popup.html │            │   background.js           │ │
│  │  popup.js   │            │                           │ │
│  │             │            │  • tabCapture.getMediaId   │ │
│  │  • Status   │            │  • Offscreen doc lifecycle │ │
│  │  • Start/   │            │  • Meeting badge "Rec"     │ │
│  │    Stop     │            │  • meeting-detector.js     │ │
│  │  • Desktop  │            └───────────┬───────────────┘ │
│  │    check    │                        │ messages         │
│  └─────────────┘                        ▼                 │
│                              ┌───────────────────────────┐ │
│  ┌─────────────┐             │   Offscreen Document      │ │
│  │ Permissions │             │   offscreen.js            │ │
│  │ Page        │             │                           │ │
│  │             │             │  • getUserMedia (tab)     │ │
│  │ Grants mic  │             │  • AudioWorklet pipeline  │ │
│  │ for ext     │             │  • MediaRecorder (video)  │ │
│  │ origin      │             │  • WebSocket to desktop   │ │
│  └─────────────┘             │  • Mic capture/relay      │ │
│                              └───────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

#### AudioWorklet Processors

| Processor | File | Role |
|-----------|------|------|
| **pcm-extractor** | `pcm-worklet.js` | Accumulates mono input into 4096-sample Float32 chunks (~256ms at 16kHz), posts to main thread |
| **pcm-injector** | `pcm-injector-worklet.js` | Upsamples 16kHz → native rate via linear interpolation + 65536-sample ring buffer; injects Electron mic relay into mix |

#### Meeting Detection

`meeting-detector.js` exports `isMeetingUrl(url)` — regex matching for:
- Google Meet (`meet.google.com`)
- Zoom (`*.zoom.us`)
- Microsoft Teams (`teams.microsoft.com`, `teams.live.com`)
- Webex (`*.webex.com`)
- GoTo Meeting (`*.goto.com`)

---

### 3. Backend API (FastAPI)

A **Python 3.13** FastAPI server handling meeting storage, AI post-processing, calendar integration, and web push notifications.

#### Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                        │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                   API Layer (/api/v1)                │  │
│  │  auth · meetings · calendar · chat · health         │  │
│  │  metrics · push · integrations                      │  │
│  └───────────────────────┬─────────────────────────────┘  │
│                          │                                 │
│  ┌───────────────────────▼─────────────────────────────┐  │
│  │                 Services Layer                       │  │
│  │  MeetingProcessor · CalendarSync · WebPushSender    │  │
│  │  SpeakerIdentifier · TaskRunner · EmbeddingService  │  │
│  └───────────────────────┬─────────────────────────────┘  │
│                          │                                 │
│  ┌───────────────────────▼─────────────────────────────┐  │
│  │               Infrastructure Layer                   │  │
│  │  OpenRouterProvider (LangChain) · Diarization        │  │
│  │  FFmpeg (audio/frame extraction) · Langfuse · S3     │  │
│  │  CircuitBreaker · ClerkOAuth · GoogleCalendar        │  │
│  └───────────────────────┬─────────────────────────────┘  │
│                          │                                 │
│  ┌───────────────────────▼─────────────────────────────┐  │
│  │                 Data Layer                            │  │
│  │  SQLAlchemy async · Alembic migrations               │  │
│  │  PostgreSQL (prod) / SQLite (dev)                    │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │               AI Agents (LangChain)                  │  │
│  │  Orchestrator · AssistantAgent · SpeakerIdentifier  │  │
│  │  Tools: vector search, composio, system tools       │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

#### Meeting Processing Pipeline

```
Desktop Upload (multipart: transcript.json + meeting.webm)
    │
    ▼
┌─ MeetingProcessor ──────────────────────────────────────┐
│  1. FFmpeg: extract WAV from WebM                       │
│  2. FFmpeg: extract video frames (key frames)           │
│  3. Diarization: Deepgram or AssemblyAI                 │
│     └─ Speaker segmentation + word-level timestamps     │
│  4. Speaker Identification (LLM + vision)               │
│     └─ Match speakers to calendar participants          │
│  5. Enriched transcript generation                      │
│  6. Store results → MeetingProcessing table             │
└─────────────────────────────────────────────────────────┘
```

---

### 4. Web App (Next.js)

A **Next.js 14** application with App Router serving both a marketing site and an authenticated workspace.

#### Route Structure

```
/ (root layout: ClerkProvider + MarketingShell)
├── /                          # Landing page
├── /about                     # About
├── /blog, /blog/[slug]        # Blog
├── /contact                   # Contact form
├── /download                  # Download page
├── /pricing                   # Pricing
├── /privacy, /terms           # Legal
├── /setup                     # Setup guide
├── /sign-in/[[...sign-in]]    # Clerk sign-in
├── /sign-up/[[...sign-up]]    # Clerk sign-up
│
└── /(app)/ (layout: WorkspaceShell — sidebar, auth-protected)
    ├── /dashboard             # Dashboard overview
    ├── /meetings              # Meeting list
    ├── /meetings/[id]         # Meeting detail + enriched transcript
    ├── /calendar              # Calendar view
    ├── /calendar/[id]         # Calendar event detail
    ├── /chat                  # Backend-powered AI chat
    └── /settings              # User settings
```

#### API Route Handlers (Next.js)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/health` | GET | Frontend health probe |
| `/api/contact` | POST | Contact form (placeholder) |
| `/api/waitlist` | POST | Waitlist signup via Resend |

---

### 5. Native Daemon (Swift)

A Swift CLI daemon using **ScreenCaptureKit** for system-level audio capture, communicating with the desktop app over a Unix domain socket using **Protocol Buffers**.

#### Protobuf Messages

```
Electron → NativeHelper (ControlMessage):
  ├── StartCapture { capture_mic, capture_system }
  ├── StopCapture
  ├── PauseCapture
  ├── ResumeCapture
  └── GetStatus

NativeHelper → Electron (NativeMessage):
  ├── AudioFrame { source, pcm_data, sample_rate, timestamp_ms, num_samples }
  ├── StatusUpdate { state, mic_active, system_audio_active }
  ├── MeetingEvent { event_type, confidence, source_app }
  ├── MetricsUpdate { cpu_percent, memory_bytes, dropped_frames }
  └── ErrorEvent { code, message }
```

#### Swift Source Files

| File | Role |
|------|------|
| `main.swift` | Entry point, lifecycle |
| `IPCServer.swift` | Unix socket server, protobuf framing |
| `AudioCaptureEngine.swift` | ScreenCaptureKit SCStream wrapper |
| `MeetingDetector.swift` | System-level meeting detection |
| `Config.swift` | Configuration constants |

---

## Cross-App Communication

```
                              ┌─────────────┐
                              │   Clerk     │
                         ┌───►│   (Auth)    │◄───┐
                         │    └─────────────┘    │
                         │                        │
┌──────────┐   JWT    ┌──┴──────────┐   JWT    ┌──┴──────────┐
│ Desktop  │─────────►│  Backend    │◄─────────│  Frontend   │
│ Electron │  REST    │  FastAPI    │  REST    │  Next.js    │
└────┬─────┘          └─────────────┘          └─────────────┘
     │
     │ WebSocket (binary)         Unix Socket (protobuf)
     │ ws://127.0.0.1:9876        ~/Library/.../scribely.sock
     │
     ▼                            ▼
┌──────────┐              ┌──────────────┐
│ Chrome   │              │ NativeHelper │
│Extension │              │   (Swift)    │
└──────────┘              └──────────────┘
```

### Communication Matrix

| From | To | Protocol | Purpose |
|------|----|----------|---------|
| **Chrome Ext** → **Desktop** | WebSocket (binary) | Stream tab PCM audio (0x01) + video chunks (0x02) + control JSON (0x03) |
| **Desktop** → **Chrome Ext** | WebSocket (binary) | Send mic PCM relay (0x04) + stop-capture control (0x03) |
| **Desktop** → **NativeHelper** | Unix socket (protobuf) | Start/stop/pause capture commands |
| **NativeHelper** → **Desktop** | Unix socket (protobuf) | Audio frames, status updates, meeting events, metrics, errors |
| **Desktop** → **Backend** | HTTPS REST + multipart | Upload meetings (transcript + video), validate auth |
| **Frontend** → **Backend** | HTTPS REST | All CRUD ops (meetings, calendar, chat, push) |
| **Desktop** → **OpenAI** | HTTPS | Direct LLM chat (streaming), Whisper (local, not API) |
| **Backend** → **OpenRouter** | HTTPS | LLM calls via LangChain for meeting processing |
| **All apps** → **Clerk** | HTTPS | Authentication, JWT validation |

---

## Data Flow Diagrams

### Meeting Lifecycle (End-to-End)

```
1. DETECT & START
   User opens meeting in browser
        │
        ├──► Extension detects meeting URL → badge "Rec"
        │    User clicks "Start Sharing" in popup
        │
        └──► Background gets tabCapture stream ID
             Creates offscreen document
             Offscreen connects WS → sends "hello"
             Desktop auto-starts meeting session

2. CAPTURE & TRANSCRIBE
   ┌─ Extension ──────────────────────────────────────────┐
   │ Tab audio → AudioWorklet (pcm-extractor)             │
   │          → 4096-sample chunks → WS (0x01)            │
   │ Tab video → MediaRecorder (VP9) → WS (0x02) 1s slices│
   └──────────────────────────────┬───────────────────────┘
                                  │
                                  ▼
   ┌─ Desktop Main Process ───────────────────────────────┐
   │ AudioPipeline: resample → energy gate → 2s chunks    │
   │             → Whisper (local, Metal GPU)              │
   │             → TranscriptEntry                         │
   │                  │                                    │
   │                  ├──► InsightEngine (heuristic detect  │
   │                  │    → debounce → LLM validate       │
   │                  │    → enrich → emit insight:new)     │
   │                  │                                    │
   │                  └──► Renderer (transcript + insights) │
   │                                                       │
   │ ScreenRecorder: saves video chunks to disk            │
   └──────────────────────────────────────────────────────┘

3. INTERACT
   User asks questions in overlay chat
   useChat embeds transcript delta in <transcript> XML tags
   PromptAssembler: system prompt + append-only messages
   OpenAI streaming → chat-delta → rendered in real-time
   BackgroundSummarizer: auto-triggers when transcript > 40% context

4. STOP & SAVE
   User stops meeting (or extension disconnects)
   Pipeline flushes remaining audio
   Transcript JSON + WebM video saved to ~/Documents/Scribely/

5. SYNC TO CLOUD
   BackendClient uploads transcript + video to FastAPI
   Backend runs MeetingProcessor pipeline:
     FFmpeg → Diarization → Speaker ID → Enriched transcript
   User views enriched meeting in web dashboard
```

### Audio Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUDIO SOURCES                             │
│                                                                  │
│  Extension (WS 0x01)    Native (UDS protobuf)    Browser API    │
│  └─ Tab PCM 16kHz       └─ System PCM             └─ getUserMedia│
│                            + mic PCM                 + getDisplay │
└──────────┬──────────────────────┬──────────────────────┬─────────┘
           │                      │                      │
           └──────────────────────┼──────────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │     AUDIO PIPELINE       │
                    │                          │
                    │  1. Resample → 16 kHz    │
                    │  2. Energy gate (mic)    │
                    │     └─ drop if RMS<0.005 │
                    │  3. Chunk accumulation   │
                    │     └─ 2s (configurable) │
                    │  4. Transcription queue  │
                    │     └─ serialized (Metal)│
                    │     └─ mic prioritized   │
                    │  5. Whisper inference    │
                    │     └─ Metal GPU         │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   TRANSCRIPT ENTRY       │
                    │   {timestamp, speaker,   │
                    │    text, source}         │
                    │                          │
                    │   → Renderer display     │
                    │   → Insight detection    │
                    │   → Chat context embed   │
                    │   → Auto-save to disk    │
                    └──────────────────────────┘
```

### LLM Chat Flow

```
User types question in InputBar
        │
        ▼
┌─ useChat Hook ──────────────────────────────────────────┐
│  1. Calculate transcript delta since last message        │
│  2. Wrap in XML:                                         │
│     <transcript>                                         │
│       NEW TRANSCRIPT SINCE LAST MESSAGE:                 │
│       [0:42] Them: What's the timeline?                  │
│       [0:45] You: End of Q2.                             │
│     </transcript>                                        │
│     <user_query>What deadlines were mentioned?</user_query>│
│  3. Send via IPC → main process                          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─ LLMService (Main) ────────────────────────────────────┐
│  1. PromptAssembler.assemble():                         │
│     • messages[0] = stable system prompt (cache prefix) │
│     • Append user message (transcript delta inline)     │
│     • Prepend summary to LAST user message only         │
│     • fitMessages: drop oldest pairs if over budget     │
│  2. OpenAI streaming with prompt_cache_key              │
│  3. Emit chat-delta tokens → renderer                   │
│  4. On done: update usage stats                         │
│  5. Auto-trigger BackgroundSummarizer if needed          │
└─────────────────────────────────────────────────────────┘
```

### Meeting Sync & Upload

```
┌─ Desktop ───────────────────────────┐
│  BackendClient.syncMeeting()        │
│                                      │
│  POST /api/v1/meetings/             │
│  Content-Type: multipart/form-data  │
│  Authorization: Bearer <clerk-jwt>  │
│                                      │
│  Parts:                              │
│    • transcript (JSON file)          │
│    • video (WebM, optional)          │
│    • sessionId, calendarEventId      │
└───────────────┬─────────────────────┘
                │
                ▼
┌─ Backend ────────────────────────────────────────────┐
│  1. Validate JWT (Clerk → user upsert)               │
│  2. Store files to disk / S3                         │
│  3. Create Meeting record + MeetingProcessing        │
│  4. Schedule async processing (asyncio.Task):        │
│     a. FFmpeg: WebM → WAV audio extraction           │
│     b. FFmpeg: Extract key video frames              │
│     c. Diarize (Deepgram/AssemblyAI)                │
│        └─ Speaker segments + word timestamps         │
│     d. Speaker Identification (LLM + vision)        │
│        └─ Match to calendar participants             │
│     e. Generate enriched transcript                  │
│     f. Update MeetingProcessing status               │
│  5. Available in web dashboard                       │
└──────────────────────────────────────────────────────┘
```

---

## Protocol Reference

### WebSocket Binary Protocol (Desktop ↔ Extension)

Server: `ws://127.0.0.1:9876` — All messages are binary with a **1-byte type header** + payload.

| Byte | Name | Direction | Payload Format |
|------|------|-----------|----------------|
| `0x01` | `MSG_AUDIO` | Extension → Desktop | Float32Array PCM samples (16 kHz) |
| `0x02` | `MSG_VIDEO` | Extension → Desktop | WebM blob bytes (VP9/VP8 + Opus, 2.5 Mbps) |
| `0x03` | `MSG_CONTROL` | Bidirectional | UTF-8 JSON string |
| `0x04` | `MSG_MIC` | Desktop → Extension | Float32Array PCM samples (16 kHz mic relay) |

#### Control Messages (0x03 JSON Payloads)

| Message | Direction | Purpose |
|---------|-----------|---------|
| `{ type: "hello", source: "chrome-extension", sampleRate: 16000 }` | Ext → Desktop | Register as capture client |
| `{ type: "stop-capture" }` | Desktop → Ext | Request capture stop |
| `{ type: "capture-stopped" }` | Ext → Desktop | Confirm capture ended |

#### Connection Lifecycle

```
1. Popup probes WS (no hello) → just checks if desktop is running
2. Offscreen connects → sends "hello" → desktop registers capture client
3. Desktop emits "connected" → auto-starts meeting
4. Audio (0x01) + Video (0x02) streaming...
5. Stop: Offscreen sends "capture-stopped" → closes WS
6. Desktop emits "disconnected" → auto-stops meeting
```

### Unix Socket Protobuf Protocol (Desktop ↔ Native)

Socket: `~/Library/Application Support/Scribely/scribely.sock`

Uses length-prefixed protobuf messages (Proto3). See [Native Daemon section](#5-native-daemon-swift) for message definitions.

### IPC Channel Reference (Electron)

#### Renderer → Main (`invoke` — request/response)

| Channel | Module | Purpose |
|---------|--------|---------|
| `get-settings` | index | Load settings |
| `update-settings` (send) | index | Persist settings partial |
| `take-screenshot` | index | Capture screen |
| `toggle-invisibility` | index | Toggle screen-share hiding |
| `meeting:start-session` | pipeline | Begin transcription session |
| `meeting:stop-session` | pipeline | End transcription session |
| `meeting:transcribe-chunk` | pipeline | Transcribe audio chunk |
| `meeting:download-model` | pipeline | Download Whisper model |
| `meeting:start-native-capture` | pipeline | Start NativeHelper |
| `meeting:stop-native-capture` | pipeline | Stop NativeHelper |
| `meeting:save-recording` | pipeline | Save recording to disk |
| `meeting:save-transcript` | pipeline | Save transcript JSON |
| `llm:chat` (send) | llm-service | Send chat message |
| `llm:cancel` (send) | llm-service | Cancel streaming |
| `llm:reset` (send) | llm-service | Clear conversation |
| `llm:set-model` | llm-service | Change LLM model |
| `llm:set-api-key` | llm-service | Store encrypted API key |
| `llm:trigger-summarize` | llm-service | Manual summarize |
| `llm:web-search` | llm-service | Web search for insights |
| `llm:suggest-follow-up` | llm-service | Generate follow-up suggestions |
| `auth:start-sign-in` | auth-service | Initiate Clerk sign-in |
| `auth:sign-out` | auth-service | Sign out |
| `auth:get-state` | auth-service | Get auth state |
| `backend:sync-meeting` | index | Upload meeting to backend |
| `extension:get-status` | index | Check extension connection |
| `recording:start` | screen-recorder | Start screen recording |
| `recording:stop` | screen-recorder | Stop screen recording |

#### Main → Renderer (`on` — event stream)

| Channel | Source | Purpose |
|---------|--------|---------|
| `meeting:transcript-entry` | pipeline | New transcript line |
| `meeting:audio-levels` | pipeline | Mic/system audio levels |
| `meeting:model-progress` | pipeline | Model download progress |
| `llm:chat-delta` | llm-service | Streaming token |
| `llm:chat-done` | llm-service | Stream complete |
| `llm:chat-error` | llm-service | Stream error |
| `llm:summary-updated` | llm-service | Background summary ready |
| `llm:usage-updated` | llm-service | Token usage stats |
| `insight:new` | insight-engine | New insight detected |
| `insight:update` | insight-engine | Insight enrichment update |
| `extension:status-changed` | index | Extension connect/disconnect |
| `extension:auto-start-meeting` | index | Auto-start from extension |
| `extension:auto-stop-meeting` | index | Auto-stop from extension |
| `auth:state-changed` | auth-service | Auth state change |
| `settings-changed` | index | Settings updated |
| `toggle-visibility` | hotkey | Global hotkey fired |

### REST API Endpoints (Backend)

Base: `/api/v1`

#### Auth (`/api/v1/auth`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/me` | Required | Current user profile |
| GET | `/status` | Optional | Auth session status |
| GET | `/config` | Public | Clerk config for frontend |
| POST | `/validate` | Required | Validate JWT token |
| GET | `/health` | Public | Auth module health |

#### Meetings (`/api/v1/meetings`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | Required | List meetings (paginated) |
| POST | `/` | Required | Upload meeting (multipart: transcript + video) |
| GET | `/stats` | Required | Dashboard statistics |
| GET | `/{id}` | Required | Meeting detail |
| GET | `/{id}/status` | Required | Processing pipeline status |
| GET | `/{id}/transcript` | Required | Enriched transcript |
| POST | `/{id}/reprocess` | Required | Re-run processing pipeline |

#### Calendar (`/api/v1/calendar`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/connect` | Required | Connect Google Calendar |
| DELETE | `/connect` | Required | Disconnect calendar |
| GET | `/status` | Required | Connection status |
| GET | `/events` | Required | Paginated events |
| GET | `/events/upcoming` | Required | Upcoming events |
| GET | `/events/overlapping` | Required | Events overlapping a time window (desktop auto-link) |
| GET | `/events/{id}` | Required | Event detail |
| POST | `/sync` | Required | Trigger calendar sync |
| POST | `/webhook/google` | Webhook | Google push notification |

#### Chat (`/api/v1/chat`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/models` | Required | List available models |
| POST | `/` | Required | Non-streaming chat |
| POST | `/stream` | Required | Streaming chat (SSE) |

#### Health (`/api/v1/health`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | Public | Overall health |
| GET | `/database` | Public | DB connectivity |
| GET | `/ready` | Public | Readiness probe |
| GET | `/live` | Public | Liveness probe (Railway) |

#### Push (`/api/v1/push`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/vapid-public-key` | Public | VAPID key for subscription |
| POST | `/subscribe` | Required | Register push subscription |
| DELETE | `/subscribe` | Required | Remove push subscription |

**Web Push (VAPID):** Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in the backend environment (`VAPID_SUBJECT` is optional; defaults to a `mailto:` in config). Generate keys with `npx web-push generate-vapid-keys`. If `CALENDAR_REMINDER_ENABLED` is true and either key is missing, the server logs a **warning at startup** and does not send pre-meeting reminders (the subscribe endpoint also returns an error).

---

## Database Schema

```
┌─────────────────────┐     ┌──────────────────────────┐
│       users          │     │       meetings            │
├─────────────────────┤     ├──────────────────────────┤
│ id (PK)             │◄────│ user_id (FK)             │
│ clerk_id (unique)   │     │ id (PK)                  │
│ email               │     │ title                    │
│ first_name          │     │ status (VARCHAR)         │
│ last_name           │     │ storage_path             │
│ avatar_url          │     │ calendar_event_id (FK)───┼──┐
│ preferences (JSON)  │     │ duration_seconds         │  │
│ status (VARCHAR)    │     │ created_at               │  │
│ created_at          │     └──────────┬───────────────┘  │
└──────┬──────────────┘                │                   │
       │                               │ 1:1               │
       │                    ┌──────────▼───────────────┐   │
       │                    │  meeting_processing       │   │
       │                    ├──────────────────────────┤   │
       │                    │  meeting_id (PK, FK)     │   │
       │                    │  status                   │   │
       │                    │  current_step             │   │
       │                    │  error_message            │   │
       │                    │  result_summary (JSON)    │   │
       │                    │  started_at, completed_at │   │
       │                    └──────────────────────────┘   │
       │                                                    │
       │ 1:N              ┌──────────────────────────┐     │
       ├────────────────►  │  calendar_connections     │     │
       │                   ├──────────────────────────┤     │
       │                   │  id (PK)                  │     │
       │                   │  user_id (FK)             │     │
       │                   │  provider                 │     │
       │                   │  access_token (encrypted) │     │
       │                   │  refresh_token            │     │
       │                   └──────────┬───────────────┘     │
       │                              │ 1:N                  │
       │                   ┌──────────▼───────────────┐     │
       │                   │  calendar_events          │◄────┘
       │                   ├──────────────────────────┤
       │                   │  id (PK)                  │
       │                   │  user_id (FK)             │
       │                   │  connection_id (FK)       │
       │                   │  google_event_id          │
       │                   │  title, description       │
       │                   │  start_time, end_time     │
       │                   │  location, status         │
       │                   └──────────┬───────────────┘
       │                              │ 1:N
       │                   ┌──────────▼───────────────┐
       │                   │ calendar_event_participants│
       │                   ├──────────────────────────┤
       │                   │  id (PK)                  │
       │                   │  event_id (FK)            │
       │                   │  email, name              │
       │                   │  response_status          │
       │                   └──────────────────────────┘
       │
       │ 1:N              ┌──────────────────────────┐
       ├────────────────►  │ user_push_subscriptions   │
       │                   ├──────────────────────────┤
       │                   │  id (PK)                  │
       │                   │  user_id (FK)             │
       │                   │  endpoint (unique)        │
       │                   │  p256dh, auth keys        │
       │                   └──────────────────────────┘
       │
       │ 1:N              ┌──────────────────────────┐
       └────────────────►  │calendar_reminder_deliveries│
                           ├──────────────────────────┤
                           │  id (PK)                  │
                           │  user_id (FK)             │
                           │  calendar_event_id (FK)   │
                           │  reminder_kind            │
                           │  (dedupe on composite)    │
                           └──────────────────────────┘
```

**Alembic Migration History:**

| Version | Change |
|---------|--------|
| 001 | Initial: `users`, `meetings` tables |
| 002 | Calendar: `calendar_connections`, `calendar_events`, `calendar_event_participants` |
| 003 | Link: `meetings.calendar_event_id` FK |
| 004 | Processing: `meeting_processing` table |
| 005 | Push: `user_push_subscriptions`, `calendar_reminder_deliveries` |
| 006 | Compat: Replace PG enums with `VARCHAR(32)` for SQLite support |

---

## Authentication Flow

```
┌─────────────┐         ┌──────────┐         ┌──────────────┐
│  Desktop    │         │  Clerk   │         │  Backend     │
│  Electron   │         │  (SaaS)  │         │  FastAPI     │
└──────┬──────┘         └────┬─────┘         └──────┬───────┘
       │                      │                      │
       │  1. auth:start-sign-in                      │
       │  ────────────────►   │                      │
       │                      │                      │
       │  2. OAuth flow       │                      │
       │  ◄──────────────►   │                      │
       │                      │                      │
       │  3. Session JWT      │                      │
       │  ◄────────────────   │                      │
       │                      │                      │
       │  4. Bearer JWT in API calls                 │
       │  ──────────────────────────────────────────►│
       │                      │                      │
       │                      │  5. JWKS validation  │
       │                      │  ◄───────────────────│
       │                      │  ────────────────────►│
       │                      │                      │
       │  6. Authenticated response                  │
       │  ◄──────────────────────────────────────────│

Same flow for Frontend (Next.js):
- ClerkProvider wraps app
- Middleware protects /dashboard, /meetings, etc.
- useAuth().getToken() → Bearer header to backend
- Backend verifies via Clerk JWKS
```

---

## Infrastructure & Deployment

| Component | Platform | Config |
|-----------|----------|--------|
| **Backend API** | Railway | `backend/railway.toml` — Docker build, `alembic upgrade head` pre-deploy, uvicorn |
| **Frontend** | Vercel (likely) | `frontend/Dockerfile` available, Next.js standalone output |
| **Database** | Railway (PostgreSQL) | AsyncPG driver, Alembic migrations |
| **Apex Redirect** | Vercel | `scribely-apex-redirect/vercel.json` → `www.scribely.xyz` |
| **Desktop** | [GitHub Releases](https://github.com/Jwuthri/Scribely-Release/releases) (DMG + updater feed) | `electron-builder`, `electron-updater`, macOS signing & notarization |
| **Extension** | Chrome Web Store | Packed as `extension_*.zip` |
| **Auth** | Clerk (SaaS) | Google OAuth, JWT, JWKS |
| **LLM (Desktop)** | OpenAI Direct | gpt-5.6 luna, terra, sol |
| **LLM (Backend)** | OpenRouter | Via LangChain ChatOpenAI |
| **Observability** | Langfuse | Both desktop (OTEL) and backend |

#### Local Dev Stack (docker-compose.yml)

| Service | Image | Port |
|---------|-------|------|
| PostgreSQL | `postgres:15-alpine` | 5432 |
| Redis | `redis:7-alpine` | 6379 |
| Kafka | `confluentinc/cp-kafka:7.4.0` | 9092, 9093 |
| Zookeeper | `confluentinc/cp-zookeeper:7.4.0` | 2181 |
| RabbitMQ | `rabbitmq:3.12-management-alpine` | 5672, 15672 |
| Backend | Custom build | 8000 |
| Frontend | Custom build | 3000 |
| Nginx | `nginx:alpine` (prod profile) | 80 |
| Celery Workers | Custom build (3 queues) | — |
| Flower | Custom build (monitoring profile) | 5555 |

> **Note:** Celery workers reference `app.core.celery_app` which doesn't exist in the current codebase. Kafka and RabbitMQ are also provisioned but not actively used. The backend currently uses `asyncio.Task` for background processing.

---

## Technology Stack

### Desktop App

| Layer | Technology |
|-------|------------|
| Framework | Electron 33 |
| UI | React 18 + Tailwind CSS + Framer Motion |
| Build | electron-vite + electron-builder |
| Audio | smart-whisper (Metal GPU), onnxruntime-node (Silero VAD) |
| LLM | OpenAI SDK (direct) |
| Auth | @clerk/clerk-js |
| Storage | electron-store (JSON persistence) |
| Native | nswindow-napi (screen-share invisibility) |
| Observability | Langfuse (OpenTelemetry) |
| Updates | electron-updater → GitHub Releases (`build.publish` → Scribely-Release) |
| Protocols | WebSocket (ws), protobuf (protobufjs) |

### Chrome Extension

| Layer | Technology |
|-------|------------|
| Manifest | V3 (service worker, offscreen document) |
| Audio | AudioWorklet (pcm-extractor, pcm-injector) |
| Video | MediaRecorder (VP9/VP8 + Opus) |
| Build | None (plain JS, no bundler) |

### Backend

| Layer | Technology |
|-------|------------|
| Framework | FastAPI + uvicorn |
| Language | Python 3.13 |
| ORM | SQLAlchemy (async) + Alembic |
| Database | PostgreSQL (asyncpg) / SQLite (dev) |
| AI | LangChain + OpenRouter |
| Auth | Clerk (JWKS JWT validation) |
| Rate Limiting | slowapi + Redis |
| Diarization | Deepgram, AssemblyAI |
| Media | FFmpeg (audio/frame extraction) |
| Storage | S3-compatible (boto3) |
| Observability | Langfuse |
| Package Manager | uv |

### Frontend

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| UI | React 18 + Tailwind CSS + Radix UI |
| Auth | @clerk/nextjs |
| Charts | Recharts |
| Email | Resend |
| Command Palette | cmdk |

### CI/CD

| Workflow | Trigger | Actions |
|----------|---------|---------|
| `backend-tests.yml` | Push to `backend/**` | Black, isort, flake8, mypy, pytest |
| `frontend-tests.yml` | Push to `frontend/**` | ESLint, TypeScript check |
| `bump-desktop-version.yml` | Push to `main` when `desktop/**` changes | Patch version bump |

---

## Configuration & Environment

### Desktop (`desktop/.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `LANGFUSE_SECRET_KEY` | No | Observability tracing |
| `LANGFUSE_PUBLIC_KEY` | No | Observability tracing |
| `CLERK_PUBLISHABLE_KEY` | Yes (for auth) | Clerk sign-in |
| `BACKEND_API_URL` | No | Backend sync endpoint |
| `SCRIBELY_SKIP_NATIVE` | No | Skip NativeHelper init |
| `SCRIBELY_DISABLE_AUTO_UPDATE` | No | Set to `1` to disable `electron-updater` (packaged builds) |

### Backend (`backend/.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL/SQLite connection |
| `OPENROUTER_API_KEY` | Yes | LLM calls via OpenRouter |
| `CLERK_SECRET_KEY` | Yes | JWT validation |
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk config endpoint |
| `REDIS_URL` | No | Rate limiting, caching |
| `LANGFUSE_SECRET_KEY` | No | Observability |
| `CORS_ORIGINS` | No | Allowed origins |

### Frontend (`frontend/.env.local`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk auth |

---

*Last updated: April 2026*
