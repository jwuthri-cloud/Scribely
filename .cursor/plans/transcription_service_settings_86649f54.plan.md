---
name: Transcription Service Settings
overview: Add a "Transcription" section to the Settings view where users can pick their STT provider (3 local tiers + 2 cloud) and enter API keys for cloud services. Wire the selection through the pipeline so the transcriber uses the chosen provider.
todos:
  - id: settings-types
    content: Add TranscriptionProvider type (5 options), TranscriptionSettings interface, and defaults to settings.ts. Update AppSettings and DEFAULT_SETTINGS.
    status: completed
  - id: model-manager
    content: Add whisper-medium.en and whisper-large-v3-turbo model definitions to model-manager.ts MODELS map.
    status: completed
  - id: transcriber-refactor
    content: "Refactor transcriber.ts to support all 5 providers: local-fast, local-balanced, local-accurate, groq, deepgram. Add setProvider() for hot-swapping."
    status: completed
  - id: pipeline-integration
    content: Update pipeline.ts to read transcription settings from store, pass to transcriber, listen for settings changes, and auto-download correct model per provider.
    status: completed
  - id: main-ipc
    content: Wire settings change notification from main index.ts update-settings handler to audioPipeline.onSettingsChanged().
    status: completed
  - id: settings-ui
    content: Add Transcription section to SettingsView.tsx with provider selector, conditional API key inputs, and model status indicator.
    status: completed
  - id: status-badges
    content: Update LiveTranscriptPanel.tsx transcription mode badge to show provider-specific labels.
    status: completed
isProject: false
---

# Transcription Service Settings

## Data Model

Add transcription settings to `AppSettings` in [settings.ts](desktop/src/renderer/src/types/settings.ts):

```typescript
export type TranscriptionProvider =
  | 'local-fast'      // whisper small.en (~488MB, Metal)
  | 'local-balanced'  // whisper medium.en (~1.5GB, Metal)
  | 'local-accurate'  // whisper large-v3-turbo (~1.6GB, Metal, multilingual)
  | 'groq'            // Groq Whisper large-v3
  | 'deepgram'        // Deepgram Nova-3

export interface TranscriptionSettings {
  provider: TranscriptionProvider
  apiKeys: {
    groq?: string
    deepgram?: string
  }
}
```

Add to `AppSettings` and `DEFAULT_SETTINGS`:

- `transcription: { provider: 'local-fast', apiKeys: {} }`

## Model Manager Updates

In [model-manager.ts](desktop/src/main/audio/model-manager.ts), replace `whisper-base.en` with `whisper-small.en` and add 2 new models:

```typescript
'whisper-small.en': {
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
  filename: 'ggml-small.en.bin',
  size: 488_000_000, // ~488MB
},
'whisper-medium.en': {
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
  filename: 'ggml-medium.en.bin',
  size: 1_530_000_000, // ~1.5GB
},
'whisper-large-v3-turbo': {
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
  filename: 'ggml-large-v3-turbo.bin',
  size: 1_620_000_000, // ~1.6GB
}
```

Provider-to-model mapping:

- `local-fast` -> `whisper-small.en` (488MB, English-only)
- `local-balanced` -> `whisper-medium.en` (1.5GB, English-only)
- `local-accurate` -> `whisper-large-v3-turbo` (1.6GB, multilingual, 809M params pruned from large-v3)

## Transcriber Refactor

Refactor [transcriber.ts](desktop/src/main/audio/transcriber.ts) to support all 5 providers:

- `**local-fast**`: `smart-whisper` with `ggml-small.en.bin`
- `**local-balanced**`: `smart-whisper` with `ggml-medium.en.bin` (same API, different model file)
- `**local-accurate**`: `smart-whisper` with `ggml-large-v3-turbo.bin` (same API, larger model, multilingual)
- `**groq**`: OpenAI-compatible endpoint at `https://api.groq.com/openai/v1/audio/transcriptions` with model `whisper-large-v3`. Since the format matches OpenAI, reuse the existing cloud method with a configurable base URL and model name
- `**deepgram**`: POST raw audio to `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true` with `Authorization: Token {key}` header and `Content-Type: audio/wav` body. Parse response from `response.results.channels[0].alternatives[0].transcript`

The `Transcriber` constructor will accept the full `TranscriptionSettings` object. A `setProvider()` method will allow switching at runtime without restarting the app. When switching between local models, the existing whisper instance is freed and a new one loaded.

## Pipeline Integration

In [pipeline.ts](desktop/src/main/audio/pipeline.ts):

- On init, read `transcription` from `electron-store` and pass to `Transcriber`
- Add IPC listener for settings changes: when `transcription.provider` changes, call `transcriber.setProvider(newProvider, apiKeys)` to hot-swap
- Model auto-download: map `local-fast` -> `whisper-small.en`, `local-balanced` -> `whisper-medium.en`, `local-accurate` -> `whisper-large-v3-turbo`

## Settings UI

Add a new "Transcription" `<Section>` in [SettingsView.tsx](desktop/src/renderer/src/components/SettingsView.tsx) between "Theme" and "Window":

- **Provider selector**: radio-style buttons grouped visually:
  - Local group (no API key needed):
    - "Fast" -- small.en, ~488MB
    - "Balanced" -- medium.en, ~1.5GB
    - "Accurate" -- large-v3-turbo, ~1.6GB
  - Cloud group (API key required):
    - "Groq" -- whisper-large-v3
    - "Deepgram" -- Nova-3
- **API key inputs**: conditionally shown below the selector when a cloud provider is selected
  - Groq: password-type input with label "Groq API Key"
  - Deepgram: password-type input with label "Deepgram API Key"
  - Show/hide toggle eye icon for each
- **Model status indicator**: for local providers, show whether the required model is downloaded + size, with a "Download" button if not

Provider change calls `updateSetting('transcription', { provider, apiKeys })` which propagates through the existing settings IPC flow.

## IPC / Preload

No new IPC channels needed. The existing `updateSettings` / `onSettingsChanged` flow handles everything. The pipeline just needs to listen for changes to `store.get('transcription')` in the main process.

In [index.ts](desktop/src/main/index.ts), after the `update-settings` handler broadcasts the change, also notify the pipeline:

```typescript
if (partial.transcription) {
  audioPipeline.onSettingsChanged(partial.transcription)
}
```

## Status in LiveTranscriptPanel

Update `transcriptionMode` to reflect the active provider name instead of just `'local' | 'cloud'`. The badge in [LiveTranscriptPanel.tsx](desktop/src/renderer/src/components/LiveTranscriptPanel.tsx) will show: `BASE`, `MED`, `TURBO`, `GROQ`, `DEEPGRAM`, or `DL...`.