# Scribely Tab Capture

Chrome extension that captures tab audio and video from browser meetings and streams them to the Scribely desktop app over a local WebSocket. Enables live transcription and AI assistance for Google Meet, Zoom, Teams, Webex, and other browser-based meetings.

## Requirements

- Google Chrome or Chromium-based browser
- Scribely desktop app installed and running (listens on `localhost:9876`)

## Installation (Development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder

No build step required — the extension uses plain JavaScript.

## How It Works

1. User opens a meeting tab (Meet, Zoom, Teams, etc.)
2. Clicks the Scribely extension icon → **Start Sharing**
3. Extension captures tab audio via `tabCapture` API
4. Streams 16 kHz PCM to desktop app at `ws://127.0.0.1:9876`
5. Desktop app transcribes with local Whisper and provides AI chat

## Project Structure

```
chrome-extension/
├── manifest.json       # Manifest V3, permissions
├── background.js      # Service worker, offscreen doc lifecycle
├── popup.html         # Extension popup UI
├── popup.js           # Connection status, start/stop capture
├── offscreen.html     # Hidden document for media capture
├── offscreen.js       # Media capture, WebSocket streaming
├── meeting-detector.js  # isMeetingUrl() for badge and display
├── pcm-worklet.js     # AudioWorklet: tab audio → 16kHz PCM
├── pcm-injector-worklet.js  # Mic relay upsample (fallback)
├── permissions.html   # Mic permission request
└── icons/             # 16, 48, 128px icons
```

## Commands

| Command | Description |
|---------|-------------|
| *(none)* | No build step. Load as unpacked extension. |

### Pack for Distribution

From the **repo root** (not `chrome-extension/`):

```bash
./scripts/pack-extension.sh
```

Creates `extension_<version>.zip` in the repo root, syncing version from `desktop/package.json` to `manifest.json`. Use this zip for Chrome Web Store uploads.

## Supported Meeting Platforms

- Google Meet
- Zoom (browser)
- Microsoft Teams
- Webex
- GoTo Meeting
- Any browser-based video call

## Permissions

- `tabCapture` — Capture tab audio/video
- `offscreen` — Hidden document for capture
- `activeTab` — Access current tab
- `tabs` — Tab management

All data stays local. No audio is sent to external servers.
