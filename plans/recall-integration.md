# Recall.ai Integration Plan (Desktop + Backend)

Status: **BUILDING** — Phases 0–5 implemented & typechecked & running (entitlement, token mint, SDK realtime, backend recall-enriched landing, language→provider, login-item auto-launch, async recording webhook). Phase 6 (Windows) pending
Owner: Julien
Last updated: 2026-06-27

Goal: integrate the **Recall.ai Desktop Recording SDK + Calendar Integration API** as a
**full alternative capture/transcribe/diarize stack**, selectable **per user via a backend
entitlement flag**. The existing local-Whisper + Swift-NativeHelper path stays as the
default and the automatic fallback. Nothing we have today may regress.

---

## 0. Confirmed decisions

| # | Decision |
|---|----------|
| 1 | Recall is a **full replacement** for entitled users: capture + recording + realtime transcript + diarization + calendar. |
| 2 | Base Scribely SDK (local Whisper) stays as **default** and **automatic fallback**. |
| 3 | Selection is **backend-controlled** via a per-user flag. No user-facing toggle (for now). |
| 4 | **Capability gate**: if the machine can't run Recall (Intel Mac, < macOS 13, missing perms), force-fall back to base SDK even if entitled. |
| 5 | **Both** transcript paths: **realtime** (in-meeting Q&A + Live Insights) and **async post-meeting** (backend STT + Recall diarization → accurate archive). |
| 6 | Recall = **paid tier** (per-hour COGS ~$0.50 record + ~$0.15 transcribe). Pricing model TBD; entitlement = proxy for "has paid". |
| 7 | Privacy: accept **cloud processing** for entitled users (Recall + AssemblyAI). Local-Whisper users stay fully on-device. |
| 8 | **Auto-record via the Desktop SDK's LOCAL `meeting-detected` event** (bot-less). Recall Calendar API adds metadata only — it CANNOT trigger the Desktop SDK (verified, §7). Auto-launch/pre-arm is Scribely-side (login-item + reminder push). |
| 9 | Keep **feature parity** — see §8 matrix. |

---

## 1. What Recall replaces vs what we keep (per entitled user)

| Concern | Today (base SDK) | Recall path |
|---|---|---|
| Capture (system+mic) | Swift NativeHelper / extension / browser | **Recall Desktop SDK** (native, auto-detects Zoom/Meet/Teams) |
| Recording file | `ScreenRecorder` → WebM on disk | **Recall** records → cloud (retrieve via API) |
| Live transcript | local Whisper, 2s chunks | **Recall realtime streaming** (partial+final) |
| Speaker labels | `You` / `Them` heuristic | **Recall speaker-timeline diarization** → real names *when available* (`participant.name` is `string\|null`; accuracy varies by platform — no per-participant streams on DSDK) |
| Post-meeting transcript | desktop transcript → backend diarization (Deepgram/AssemblyAI) + vision speaker-ID | **backend Whisper STT + Recall diarization timeline** (§6) |
| Calendar | our Google Calendar sync (`calendar_sync.py`) | **Recall Calendar API** (Google + Outlook) = **event sync + metadata only** (no auto-launch; that's Scribely-side, §7) |
| Overlay invisibility | `NSWindow sharingType=.none` | **unchanged — orthogonal**; Recall only swaps the recording engine, the overlay is a separate window |
| Chat / Insights / Summarization | consume transcript-entry contract | **unchanged** (Recall maps into same contract) |

**Keep regardless of provider:** overlay invisibility, push-to-talk chat STT (`useWhisperSTT`),
chat Q&A, Live Insights, background summarization, settings/theming. These all consume the
transcript-entry contract and are provider-agnostic.

---

## 2. Architecture overview

```
                         ┌────────────────────────── BACKEND (FastAPI) ──────────────────────────┐
                         │                                                                        │
  Clerk JWT  ───────────▶│  /auth/status  → returns use_recall_sdk (entitlement)                  │
                         │  /recall/upload-token  → POST /api/v1/sdk_upload/ → upload_token         │  ← holds RECALL_API_KEY
                         │  /recall/calendar/*    → connect Google/Outlook via Recall Calendar API │
                         │  webhook: calendar.sync_events → push "meeting soon" (metadata only)    │
                         │  webhook: sdk_upload.complete  → retrieve recording → STT/diarize       │
                         │  POST /meetings/  → store transcript (recall-enriched → skip Deepgram)  │
                         └────────────────────────────────────────────────────────────────────────┘
                                   ▲ token / entitlement / calendar          ▲ transcript+recording ref
                                   │                                          │
   ┌───────────────────────────── DESKTOP (Electron) ──────────────────────────────────────────┐
   │  on sign-in: read use_recall_sdk + run capability check → choose provider                   │
   │                                                                                             │
   │  provider = 'recall' ─────────────────────────────────────────────┐                        │
   │    RecallController (new): RecallAiSdk.init → meeting-detected      │  provider = 'base'     │
   │      → get upload_token from backend → startRecording              │    existing pipeline:  │
   │      → realtime transcript events → map to transcript-entry        │    NativeHelper/ext/   │
   │      → emit 'meeting:transcript-entry' (SAME channel)              │    browser → Whisper   │
   │                                                                    │    → transcript-entry  │
   │  renderer (LiveTranscriptPanel, useChat, Insights) — UNCHANGED ◀───┴────────────────────────┘
   │  auto-launch at login (setLoginItemSettings) so calendar can wake the app                    │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘
```

Core principle: **Recall is a second capture backend behind the existing
`transcript-entry` contract** (`desktop/src/main/audio/pipeline.ts:525`). Everything
downstream of that contract is untouched.

---

## 3. Entitlement + capability gating

**Storage** — DB column (cleanest; piggybacks existing flows):
- `users.use_recall_sdk BOOLEAN NOT NULL DEFAULT FALSE` via new Alembic migration `007_recall_entitlement.py`.
  Column on `backend/app/database/models/user.py`. No index (PK lookups).
- Admin flip: `PATCH /api/v1/admin/users/{user_id}/recall-sdk`, gated by existing
  `require_admin()` (`backend/app/security/clerk_auth.py:302`). ~10 lines. SQL `UPDATE` is fine for MVP.

**Desktop read** — at sign-in:
- Add `use_recall_sdk` to `UserProfileResponse` in `backend/app/api/v1/auth.py` (1 line).
- Persist in desktop auth store (`desktop/src/main/auth/auth-service.ts:23`).

**Capability check** (decision #4) — desktop, before choosing `recall`:
```
canRunRecall = entitled
  && process.platform in {darwin (arm64, ≥13.0), win32 (10+ x64)}
  && Recall perms grantable (mic, screen-capture, accessibility)
```
If `!canRunRecall` → silently use base SDK (log the reason). This is the `deriveProvider`
branch at `desktop/src/main/audio/pipeline.ts:27`.

**Backend defense-in-depth**: even if a desktop uploads a "recall" transcript, the backend
trusts its own `user.use_recall_sdk` before skipping the diarization pipeline.

---

## 4. Security — token minting (mandatory, net-new)

The raw Recall API key is **non-expiring + workspace-scoped** and **must never ship in the DMG**.

- Key lives **server-side only**: `RECALL_API_KEY`, `RECALL_API_REGION` in backend config
  (`backend/app/config.py`). Remove it from `desktop/.env`.
- New endpoint `POST /api/v1/recall/upload-token`:
  - auth: `get_current_user_with_db` **AND** `user.use_recall_sdk`.
  - server POSTs to `{REGION_BASE}/api/v1/sdk_upload/` (canonical **underscore** path; *not* `sdk-upload`)
    with header `Authorization: Token $RECALL_API_KEY`.
  - **body** `{ recording_config?, metadata? }` — the **recording_config is set HERE at mint time**
    (transcript provider + `realtime_endpoints`), not in `startRecording`. Minimal/empty body is accepted.
  - response `201` → `{ id, upload_token, ... }` (`id` = upload_id used later for retrieval).
  - returns `upload_token` to the desktop. Rate limit: 300 req/min/workspace.
- ⚠️ **Token lifetime is UNDOCUMENTED** — do not architect around an assumed short TTL or token reuse.
  Treat it as **one token per recording** of unknown lifetime; mint fresh on each `meeting-detected`.
- `REGION_BASE` must match the workspace region: `us-west-2` (PAYG) / `us-east-1` (monthly) /
  `eu-central-1` / `ap-northeast-1`, and equal the desktop's `init({apiUrl})`.
- Desktop calls this from `backend-client.ts` on `meeting-detected`, before `startRecording({windowId, uploadToken})`.

---

## 5. Realtime path (in-meeting)

Goal: live transcript for the LiveTranscriptPanel + Q&A + Live Insights, with **real speaker names**.

1. `RecallController` (new: `desktop/src/main/audio/recall-controller.ts`)
   `RecallAiSdk.init({ apiUrl: region })` on app start (only when provider may be recall).
2. On `'meeting-detected'` (payload `{ window }`): fetch `upload_token` (§4) →
   `startRecording({ windowId: evt.window.id, uploadToken })`.
3. Subscribe via the **single `realtime-event` listener** (realtime is delivered there, *not* on
   per-type listeners). Discriminate by `evt.event`:
   - `transcript.data` = finalized utterance; `transcript.partial_data` = interim. **No `is_final` flag**
     — the event name is the only signal.
4. Map into the existing contract (`pipeline.ts:525`). **Verified payload shape** (from `muesli` + docs):
   ```ts
   // evt.data.data.words[]  → { text, start_timestamp.relative, end_timestamp.relative|null }  (seconds)
   // evt.data.data.participant → { id, name: string|null, is_host, email: string|null, ... }
   { id, speaker: evt.data.data.participant?.name ?? 'Speaker',  // name may be null → fallback
     text, startTime, endTime,           // from word relative offsets (seconds → ms)
     source: 'system', confidence: 1.0,  // NB: words carry NO confidence — synthesize/omit
     isEdited: false }
   ```
5. Emit on the **same** `'meeting:transcript-entry'` IPC channel → renderer + InsightEngine unchanged.

**Chunking parity** (your ask): there is **no native chunk concept** — timing is **per-word**
(`start_timestamp.relative` / `end_timestamp.relative`, float seconds). To preserve `chunkDurationSec`
semantics, coalesce words until a ~2s window is filled, **or** simply commit one entry per
`transcript.data`. Partial cadence / cumulative-vs-incremental is **undocumented — measure in Phase 2**.

**Provider**: default `recallai_streaming` (no extra account, but **English-only**, `prioritize_low_latency`,
finalizes 1–3s after utterance end). To use AssemblyAI, the field is **`assembly_ai_v3_streaming`**
(not `assembly_ai_streaming`) and it needs a card on file at AssemblyAI. Set in `recording_config.transcript.provider`
at token-mint (§4) with `realtime_endpoints:[{ type:'desktop_sdk_callback', events:['transcript.data','transcript.partial_data'] }]`.

---

## 6. Async path (post-meeting) — backend STT + Recall diarization

Goal: an accurate archived transcript that's better than the realtime stream.

1. Recall finishes recording → auto-uploads to cloud (per `retention` config; the SDK's
   `uploadRecording`/`upload-progress` are **deprecated no-ops in 2.0.22 — do not wire them**) → fires
   **`sdk_upload.complete`** webhook to backend (note: `.complete`, *not* `.completed`; siblings:
   `sdk_upload.failed`, `sdk_upload.recording_started`, `sdk_upload.recording_ended`). Delivered via Svix.
2. Webhook handler → retrieve: `GET {BASE}/api/v1/recording/?desktop_sdk_upload_id={id}` → `results[0]`;
   download URLs at `recording.media_shortcuts.video_mixed.data.download_url` (MP4) and
   `.transcript.data.download_url` — available only once the media object is `done`. Save into
   `{UPLOAD_DIR}/{user_id}/{meeting_id}/`. **DSDK media = mixed MP4 + mixed MP3 only; NO per-participant
   streams** (FAQ: "separate audio streams currently not available"). Exact codec/sample-rate undocumented
   → `ffprobe` a real recording in Phase 2.
3. Backend pipeline (reuse `meeting_processor.py` structure):
   - **STT**: run **Whisper on the backend** over the recording audio → high-accuracy text + word timings.
     *(New backend component — see note.)*
   - **Diarization**: use **Recall's diarized timeline** (speaker→intervals) instead of Deepgram/AssemblyAI.
   - **Align**: map Whisper words onto Recall speaker intervals → `transcript_enriched.json` v2
     (`diarization{ provider:'recall', speakerMap, utterances }`).
   - Speaker-ID vision step (`speaker_identifier.py`) optional — Recall already gives real names, so
     this likely becomes a no-op for recall meetings.
4. Set `MeetingProcessing`: `diarization_provider='recall'`, `enriched_transcript_saved=True`,
   `has_nonempty_diarization=True`, `status=COMPLETED`.

> **Ponytail note:** Recall's *async* transcript already returns diarized, speaker-named text and is
> more accurate than realtime. Running our own backend Whisper on top is a deliberate quality/control
> choice, not free — it adds a Whisper dependency on the backend (faster-whisper / whisper.cpp / API)
> and CPU/GPU cost. **Cheaper alternative:** skip backend Whisper, use Recall's async transcript
> directly. Recommend we A/B this in Phase 5 and keep backend-Whisper behind a flag. Decide before building §6.

For non-entitled users: unchanged — desktop Whisper transcript → backend Deepgram/AssemblyAI diarization.

---

## 7. Calendar integration + auto-launch

> **VERIFIED (docs, 2026-06-27):** The Recall Calendar API **cannot drive the Desktop SDK**. Its
> recording automation is **Bot-API-only** (it schedules bots that *join* the call via
> `calendar_events_bot_create`). The Scheduling Guide states verbatim: *"This guide does NOT cover the
> Desktop SDK."* For the Desktop SDK, the Calendar API is **metadata-enrichment only** (recall.ai/products:
> for the Bot API calendar "enables bots to automatically join meetings…"; for the Desktop SDK it "also
> enriches recordings with meeting metadata"). **There is no documented calendar→Desktop-SDK auto-launch.**
> Also: the calendar's participant-**email** enrichment only populates on **bot** recordings — DSDK uploads
> have no email data, so attendee emails must come from our own calendar linkage.

So auto-record is **local-detection-driven**, and pre-arm/launch is **Scribely-side**. This still delivers
the target UX (meeting starts → Scribely records, no bot):

1. **Auto-record (the trigger):** Desktop SDK auto-detects Zoom/Meet/Teams locally → `meeting-detected`
   → `startRecording` (§5). **No calendar needed for the trigger** — it fires even on unplanned meetings.
2. **Pre-arm / launch (Scribely-side):** desktop sets `app.setLoginItemSettings({ openAtLogin: true })`
   so the app is alive before meetings; backend pushes "meeting starting" via **existing reminder infra**
   (`calendar_reminder_loop.py` + Web Push / desktop IPC) to surface/arm the overlay ahead of time.
3. **Calendar = metadata.** Two options for the calendar source:
   - **(A) Keep our Google Calendar** (`calendar_sync.py`, `google_calendar.py`) — already working,
     direct-to-Google, no new third-party data sharing. **Recommended default.**
   - **(B) Adopt Recall Calendar V2** — adds Outlook for free + offloads sync/dedup, but requires handing
     Recall the user's long-lived OAuth **refresh token** (new data-sharing posture). Endpoints
     `POST /api/v1/recall/calendar/connect|disconnect|status`; consume `calendar.sync_events` webhooks →
     store in `CalendarEvent` (add `source`). **Defer unless/until Outlook is required.**
4. Keep `Meeting.calendar_event_id` linkage (`meetings.py:454`) for titles + diarization hints + attendee emails.

**Net:** the bridged flow (calendar metadata + Scribely pre-arm + DSDK local trigger) is the **only**
supported design — there is nothing to "upgrade to direct."

---

## 8. Feature parity matrix

| Feature | Base SDK | Recall | Action |
|---|---|---|---|
| Live transcript (chunked, seconds) | ✅ Whisper 2s | ✅ realtime partial/final | map → contract (§5) |
| Speaker attribution | You/Them | ✅ real names | strict upgrade |
| Live Insights | ✅ | ✅ (same contract) | none |
| Chat Q&A + transcript deltas | ✅ | ✅ | none |
| Background summarization | ✅ | ✅ | none |
| Meeting recording (WebM) | ✅ local | ✅ cloud retrieve | adjust file source (§6) |
| Post-meeting diarized archive | Deepgram/AssemblyAI | Recall + backend Whisper | §6 |
| Calendar reminders / Web Push | ✅ Google | ✅ Recall G+Outlook | §7 |
| Screen-share invisibility | ✅ | ✅ unchanged | none — orthogonal to recording engine |
| Push-to-talk chat STT | ✅ local Whisper | ✅ local Whisper | keep local, provider-independent |
| Offline operation | ✅ | ❌ (cloud only) | base SDK only; documented |

---

## 9. Backend changes (files)

- `backend/alembic/versions/007_recall_entitlement.py` — add `users.use_recall_sdk`.
- `backend/app/database/models/user.py` — column.
- `backend/app/api/v1/auth.py` — `use_recall_sdk` in `UserProfileResponse`.
- `backend/app/api/v1/admin*` — `PATCH .../recall-sdk` (require_admin).
- **`backend/app/api/v1/recall.py` (new)** — `POST /upload-token`; (optional) calendar connect/disconnect/status; webhooks `sdk_upload.complete` + `calendar.sync_events`. Verify Svix signatures (`svix` Python lib).
- `backend/app/services/meeting_processor.py` — recall branch: backend Whisper STT + align Recall diarization (§6).
- **`backend/app/infrastructure/recall/` (new)** — Recall API client (token mint, retrieve recording, calendar).
- **`backend/app/infrastructure/stt/` (new)** — backend Whisper STT (if §6 backend-Whisper chosen).
- `backend/app/api/v1/meetings.py:485` — skip Deepgram/AssemblyAI when transcript is recall-sourced.
- `backend/app/config.py` — `RECALL_API_KEY`, `RECALL_API_REGION`.

## 10. Desktop changes (files)

- `desktop/src/main/audio/pipeline.ts:27` (`deriveProvider`) — add `'recall'` from entitlement + capability.
- `desktop/src/main/audio/pipeline.ts:124` (ctor) — when recall, skip Transcriber/ModelManager.
- `desktop/src/main/index.ts:~990` — when recall, skip NativeHelper + resample/chunk/VAD path.
- **`desktop/src/main/audio/recall-controller.ts` (new)** — SDK init, meeting-detected, startRecording, realtime→contract mapping.
- `desktop/src/main/screen-recorder.ts:254` — bypass external recording for recall users.
- `desktop/src/main/backend-client.ts` — `getRecallUploadToken()`; write transcript in enriched shape.
- `desktop/src/main/auth/auth-service.ts:23,134` — persist + expose `use_recall_sdk`; capability check.
- `desktop/src/main/index.ts` — `app.setLoginItemSettings({openAtLogin:true})` for auto-launch.
- `desktop/electron.vite.config.ts` — add `@recallai/desktop-sdk` to native externals.
- `desktop/package.json` build / `npm run dist` — special-case `osx-sign` for Recall native binaries (known Electron Forge issue); reference Muesli sample, not the archived webpack sample.
- `desktop/src/renderer/src/types/settings.ts` — internal `provider:'recall'` value (no UI toggle).

## 11. Config / secrets

- Backend: `RECALL_API_KEY` (already in `backend/.env`), `RECALL_API_REGION`.
- **Remove `RECALLAI_API_KEY` from `desktop/.env`** — desktop must never hold it.

---

## 12. Phased build plan

| Phase | Scope | Size | Independently testable by |
|---|---|---|---|
| **0** | Entitlement column + `/auth/status` field + admin PATCH + desktop reads flag + capability check | S (1–2d) | flip flag in DB → desktop logs chosen provider |
| **1** | Token-minting endpoint + backend Recall client + config; strip key from desktop | S (1–2d) | curl mints a valid `upload_token` |
| **2** | Desktop SDK wiring: `recall-controller.ts`, meeting-detected → startRecording, realtime → contract | M–L (1–2wk) | a real meeting shows live transcript with real names |
| **3** | Backend landing: skip Deepgram when recall-sourced; store enriched transcript | S–M (3–5d) | recall meeting appears completed, speaker names intact |
| **4** | Calendar (Recall) connect + webhooks + auto-launch + auto-record | M–L (1–2wk) | scheduled meeting auto-arms + records |
| **5** | Async post-meeting: `sdk_upload.completed` webhook → retrieve → backend Whisper STT + Recall diarization align | M (1wk) | archived transcript more accurate than realtime |
| **6** | Windows (separate project: invisibility, no NativeHelper/Metal) | L (2–3wk+) | Windows build records a meeting |

Mac MVP (Phases 0–3): ~3–4 weeks. **Laziest first slice:** Phase 0 (flip your own account via SQL) +
Phase 1 + Phase 2 realtime only → answers "do real names + Recall reliability feel better, invisibility intact?"

---

## 13. Risks & validation gates

1. ~~Invisibility~~ — **NOT a risk.** Scribely's overlay invisibility is its own `NSWindow`
   (`sharingType=.none`); the Recall SDK only replaces the recording engine. Different layers; swapping
   recorders does not touch the overlay window. At most a trivial check that a permission prompt doesn't
   appear mid-share — not a blocker.
2. **Diarization quality (real names):** RESOLVED from docs — DSDK has **no per-participant streams**, so
   "perfect" diarization is unavailable; names come from **speaker-timeline** diarization (accessibility-API
   active-speaker), accuracy varies by platform and `participant.name` may be `null`. Not a guaranteed
   upgrade — validate name quality on real Zoom/Teams/Meet calls in Phase 2; keep a `Speaker N` fallback.
3. **Cost / no billing infra:** ~$0.65/record-hr ($0.50 record + $0.15 transcribe), zero billing in
   codebase. Add at least an internal usage cap before wider rollout. Pricing model (decision #6) TBD.
4. **Packaging/signing:** SDK `postinstall` downloads prebuilt Frameworks from S3 (CI must allow the fetch);
   macOS signing needs the `@electron/osx-sign` → `github:recallai/osx-sign` override. We use electron-vite
   (not Forge), so the `external` + `asar-unpack` of `node_modules/@recallai` pattern is **inference —
   validate in Phase 2**.
5. **Calendar cannot trigger DSDK:** RESOLVED — bot-only for automation; DSDK auto-record is local (§7).
   No work item; just don't design a calendar→record path.
6. **Intel/old Macs:** capability gate must never flip them to Recall (decision #4). Floors: macOS **13.0+**
   (video) on **Apple Silicon only**; audio-only needs **14.2+** + `NSAudioCaptureUsageDescription`.
7. **Vendor lock-in:** keep local-Whisper path alive as default — do not delete it.
8. **English-only realtime** if using `recallai_streaming` — use `assembly_ai_v3_streaming` for multi-language.

## 14. Open items — confirm hands-on (docs silent; do NOT assume)

These are genuinely undocumented after a full doc read — verify empirically in Phase 2, not from spec:

- **`upload_token` lifetime/scope** — not documented anywhere. Mint fresh per recording; confirm w/ Recall support.
- **Full `recording_config` field schema** (transcript/realtime_endpoints/diarization/retention/video_mixed_mp4/audio_mixed_mp3) — behind the "Try It!" explorer; confirm exact nested field names hands-on.
- **Downloadable media codec/sample-rate/channels/fps** — only container (MP4/MP3) is documented; `ffprobe` a real recording.
- **`transcript.partial_data` cadence** + cumulative-vs-incremental — measure.
- **Speaker-name quality** on real Zoom/Teams/Meet calls + the working `recording_config.diarization` keys.
- **electron-vite externalize + asar-unpack** of `@recallai/desktop-sdk` (samples use Forge) — validate packaging/signing.
- **Min Electron version** — SDK declares no `peerDependencies`; samples use Electron 36/37. Confirm ours is compatible.
- **`recording_id` zero-UUID quirk** when using webhooks (FAQ mentions it) — confirm affected fields.
- **Backend Whisper (§6) vs Recall async transcript** — A/B for cost/quality before committing §6's STT step.

---

## Appendix A — Verified Recall facts (full doc read, 2026-06-27)

Source of truth folded into the sections above; key citations:

- **Package:** `@recallai/desktop-sdk` (JS/TS only; `@nightly` channel). `postinstall` pulls prebuilt
  Frameworks from S3. Webpack/Vite: mark as external (`commonjs @recallai/desktop-sdk`).
- **Methods:** `init({apiUrl})`, `requestPermission("accessibility"|"microphone"|"screen-capture"|"system-audio")`,
  `startRecording({windowId, uploadToken})`, `stopRecording({windowId})`, `pauseRecording`/`resumeRecording`,
  `prepareDesktopAudioRecording()` (in-person), `shutdown()`. Listener: `RecallAiSdk.addEventListener(event, cb)`.
- **Events:** `permissions-granted`, `permission-status`, `meeting-detected` `{window}`, `recording-started`,
  `recording-ended`, `meeting-updated`, `meeting-closed`, `media-capture-status`, `participant-capture-status`,
  `realtime-event` `{window,type,status}`, `network-status`, `error`, `shutdown`. **Realtime transcript arrives
  on `realtime-event`**, discriminated by `evt.event` ∈ {`transcript.data`, `transcript.partial_data`, `transcript.provider_data`}.
- **Realtime payload:** `evt.data.data.words[]` = `{text, start_timestamp.relative, end_timestamp.relative|null}`
  (float seconds); `evt.data.data.participant` = `{id, name:string|null, is_host, email:string|null, ...}`.
  No `is_final`, no per-word `confidence`. One `language_code` per segment.
- **Token mint:** `POST {region}/api/v1/sdk_upload/`, `Authorization: Token $KEY`, body `{recording_config?, metadata?}`
  → `201 {id, upload_token}`. `recording_config` (incl. realtime provider + endpoints) set HERE. 300 req/min/workspace.
- **Webhooks (Svix):** `sdk_upload.complete` / `.failed` / `.recording_started` / `.recording_ended`. Payload
  `{event, data:{data:{code,sub_code,updated_at}, recording:{id}, sdk_upload:{id}}}` — use `recording.id` to retrieve.
- **Retrieve:** `GET {region}/api/v1/recording/?desktop_sdk_upload_id={id}` → `results[0].media_shortcuts.{video_mixed,transcript}.data.download_url` once `done`.
- **Media:** mixed **MP4** (video) + mixed **MP3** (audio). **No per-participant streams** ("separate audio streams currently not available"). Realtime raw audio (if enabled) = base64 mono S16LE 16k.
- **Platforms:** Windows 10+ x64; macOS **13.0+ Apple-Silicon-only** (video), **14.2+** for audio-only. Auto-detect: Zoom/Teams/Meet desktop (Meet via Chrome/Safari).
- **Data flow:** auto-uploads to Recall cloud (no offline; network drop ends recording). ZDR (`retention=null`) → realtime-only, no post-meeting retrieval.
- **Pricing (2026 PAYG):** $0.50/record-hr (same for DSDK + Bot), Recall transcription $0.15/record-hr (3rd-party billed by provider), 7-day free storage then $0.05/hr per 30d, Calendar API free, first 5h free, prorated to the second.
- **Calendar:** Google + Outlook; V2 recommended (you own OAuth client + pass refresh token). Automation = **bots only**; with DSDK = **metadata enrichment only** (no auto-launch; emails only on bot recordings).
- **Samples:** `recallai/muesli-public` (current), `recallai/dsdk-tutorial`. The archived `desktop-sdk-electron-webpack-sample` and the SDK's `uploadRecording`/`upload-progress` flow are **stale — don't copy**.
