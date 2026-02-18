# Chrome Web Store — Listing Cheat Sheet

Everything you need to fill in on the Chrome Web Store Developer Dashboard.

---

## Fiche Play Store

### Description (required)

```
Scribely Tab Capture streams your browser tab's audio and video to the Scribely desktop app for real-time meeting transcription and AI-powered assistance.

How it works:
1. Open any meeting in your browser (Google Meet, Zoom Web, Teams, etc.)
2. Click the Scribely extension icon and hit "Start Sharing"
3. Your tab's audio is captured and sent to the Scribely desktop app running on your machine
4. Get live transcription, AI Q&A, and real-time insights — all locally

Key features:
• One-click tab audio & video capture from any browser meeting
• Streams directly to the Scribely desktop app over a local connection (localhost only)
• No audio data ever leaves your machine — everything stays local
• Works with Google Meet, Zoom, Microsoft Teams, Webex, and any browser-based meeting
• Microphone capture support for full meeting transcription (your voice + others)
• Lightweight — no impact on meeting performance

Requirements:
• Scribely desktop app must be installed and running on your Mac
• macOS only (Scribely desktop is a macOS application)

Privacy:
All audio and video data is streamed exclusively to localhost (127.0.0.1:9876). No data is sent to any external server. The Scribely desktop app processes everything locally using on-device AI models.
```

### Catégorie

→ **Outils** (Tools) ✓ already selected

### Langue

→ **anglais (États-Unis)** ✓ already selected

---

## Éléments graphiques (Graphics)

### Icône du magasin (Store Icon) — REQUIRED
- **Size:** 128 × 128 px, PNG
- **What to upload:** Use the Scribely app icon (the dark rounded square with the red recording dot). Export/resize `desktop/src/renderer/src/assets/app-icon.png` to exactly 128×128.

### Captures d'écran (Screenshots) — REQUIRED (at least 1)
- **Size:** 1280 × 800 or 640 × 400, JPEG or PNG, no alpha
- **What to capture:** Take 1–3 screenshots showing:
  1. The extension popup connected to the desktop app, with "Start Sharing" button visible
  2. The extension popup while actively capturing (red dot, "Stop Sharing" state)
  3. (Optional) The Scribely desktop app showing a live transcript alongside the extension

### Petite image promotionnelle (Small promo tile) — optional
- **Size:** 440 × 280 px, JPEG or PNG, no alpha
- **Suggestion:** Scribely logo centered on a dark background (#1a1a2e) with tagline "Live meeting transcription from your browser"

### Image promotionnelle en haut de la page (Marquee promo) — optional
- **Size:** 1400 × 560 px
- Skip for now, not required.

---

## Champs supplémentaires

### URL officielle
→ Leave as "Aucune" for now (or add your website if you have one)

### URL de la page d'accueil
→ Leave blank, or your GitHub/website URL

### URL de l'assistance
→ Leave blank, or a GitHub Issues link like: `https://github.com/julienwuthrich/assistme/issues`

### Contenu réservé aux adultes
→ **Off** (disabled)

---

## Confidentialité (Privacy tab)

### Description de l'objectif unique (Single purpose description) — REQUIRED

```
Capture browser tab audio and video and stream it to the Scribely desktop application for local, real-time meeting transcription.
```

### Justification de l'autorisation tabCapture — REQUIRED

```
tabCapture is used to capture the audio and video output of the active browser tab during online meetings (Google Meet, Zoom, Teams, etc.). The captured media stream is processed locally by an AudioWorklet to extract PCM audio, which is then sent over a local WebSocket connection (localhost:9876) to the Scribely desktop application for real-time transcription. No audio data is transmitted to any external server.
```

### Justification de l'autorisation offscreen — REQUIRED

```
offscreen is required to create a hidden offscreen document that handles the media capture and WebSocket streaming. Chrome's tabCapture API requires a document context to process the captured MediaStream. The offscreen document runs an AudioWorklet for PCM extraction and a MediaRecorder for video, and manages the local WebSocket connection to the Scribely desktop app. This cannot run in the service worker.
```

### Justification de l'autorisation activeTab — REQUIRED

```
activeTab is used to identify the currently active tab so the extension can display the tab's title and favicon in the popup UI, and to target the correct tab when initiating tab capture via the tabCapture API.
```

### Utilisez-vous code distant ? (Do you use remote code?)

→ Select **"Non, je n'utilise pas 'code distant'"** (No)

Your extension is 100% local JavaScript with no build step, no CDN imports, no eval(), no remote script loading. All code is bundled in the extension package.

⚠️ **IMPORTANT:** I see you currently have "Oui" (Yes) selected — **change this to "Non"**. Your extension does NOT use remote code. The WebSocket connection to localhost is data transfer, not code execution.

### Consommation de données (Data collection)

Check **NONE** of the boxes. Your extension:
- Does not collect personally identifiable information
- Does not collect health information
- Does not collect financial information
- Does not collect authentication information
- Does not collect personal communications
- Does not collect location data
- Does not collect web history
- Does not collect user activity

The audio/video stream goes exclusively to localhost and is never stored or transmitted externally by the extension itself.

---

## Distribution tab

### Visibilité (Visibility)
→ Choose **"Non répertorié"** (Unlisted) if you only want people with the direct link to find it
→ Choose **"Public"** if you want it discoverable in the Chrome Web Store

### Régions
→ All regions (default)

---

## Before submitting — Checklist

- [ ] Icons exist in `chrome-extension/icons/` (icon16.png, icon48.png, icon128.png)
- [ ] Store icon uploaded (128×128)
- [ ] At least 1 screenshot uploaded (1280×800 or 640×400)
- [ ] Description filled in
- [ ] All 3 permission justifications filled in
- [ ] Remote code set to "Non"
- [ ] Data collection: nothing checked
- [ ] Single purpose description filled in
- [ ] Privacy policy URL (may be required — create a simple one if Google asks)
