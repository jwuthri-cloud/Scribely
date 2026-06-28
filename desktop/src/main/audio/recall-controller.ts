import { createLogger } from '../logger'
import type { AudioPipeline } from './pipeline'
import type { BackendClient } from '../backend-client'

const log = createLogger('recall')

/**
 * Drives the Recall.ai Desktop Recording SDK (the alternative capture backend for
 * entitled users). Recall auto-detects meetings locally and captures + transcribes
 * in this (main) process — so the flow is inverted vs the user pressing Alt+M:
 * the SDK tells us a meeting started, we react.
 *
 * Lifecycle: meeting-detected → mint upload token (backend) → startRecording →
 * start a Whisper-free pipeline session → realtime transcript → pipeline entries.
 * recording-ended → tell the renderer to stop (save/sync transcript).
 *
 * The raw Recall API key never lives here — the backend mints per-recording tokens.
 * api_url comes from process.env.RECALL_API_URL (baked in via electron.vite.config)
 * and MUST match the backend's RECALL_API_REGION.
 */
export class RecallController {
  private sdk: any | null = null
  private initialized = false
  private activeWindowId: string | null = null
  /** Recall upload id for the active recording — tags the transcript so the async
   *  sdk_upload.complete webhook can attach the downloaded recording. */
  private activeUploadId: string | null = null
  /** When the renderer initiates the stop, don't echo an auto-stop back to it. */
  private suppressAutoStop = false

  constructor(
    private readonly backendClient: BackendClient,
    private readonly pipeline: AudioPipeline,
    private readonly sendToRenderer: (channel: string, data: unknown) => void,
    /** Current transcription language setting ('en' | 'multi') — picks the Recall provider. */
    private readonly getLanguage: () => 'en' | 'multi',
  ) {}

  /** Lazy-load the native SDK and register listeners. Idempotent; safe if the SDK
   *  isn't installed (logs and disables rather than crashing the app). */
  init(): boolean {
    if (this.initialized) return true
    try {
      // CommonJS native module — not bundled (Vite external). No type defs shipped.
      this.sdk = require('@recallai/desktop-sdk')
    } catch (err) {
      log.error('Recall SDK not available (is @recallai/desktop-sdk installed?):', err)
      return false
    }

    const apiUrl = process.env.RECALL_API_URL || 'https://us-west-2.recall.ai'
    try {
      this.sdk.init({ api_url: apiUrl })
    } catch (err) {
      log.error('RecallAiSdk.init failed:', err)
      this.sdk = null
      return false
    }

    this.requestPermissions()
    this.registerListeners()
    this.initialized = true
    log.success(`Recall SDK initialized (api_url=${apiUrl})`)
    return true
  }

  /** Best-effort macOS permission prompts. The SDK method/permission set isn't
   *  fully documented; guard everything so a shape mismatch can't crash startup. */
  private requestPermissions(): void {
    if (typeof this.sdk?.requestPermission !== 'function') return
    for (const perm of ['accessibility', 'screen-capture', 'microphone', 'system-audio']) {
      try {
        this.sdk.requestPermission(perm)
      } catch (err) {
        log.debug(`requestPermission(${perm}) failed:`, err)
      }
    }
  }

  private registerListeners(): void {
    this.sdk.addEventListener('meeting-detected', (evt: any) => {
      void this.onMeetingDetected(evt)
    })

    this.sdk.addEventListener('realtime-event', (evt: any) => {
      if (evt?.event === 'transcript.data' && evt?.data?.data) {
        this.onTranscript(evt)
      }
    })

    this.sdk.addEventListener('recording-ended', (evt: any) => {
      log.info('Recall recording ended')
      this.activeWindowId = null
      if (this.suppressAutoStop) {
        this.suppressAutoStop = false
        return
      }
      this.sendToRenderer('recall:auto-stop-meeting', {})
    })

    this.sdk.addEventListener('error', (evt: any) => {
      log.error('Recall SDK error:', evt?.message ?? evt)
    })
  }

  private async onMeetingDetected(evt: any): Promise<void> {
    const windowId = evt?.window?.id
    if (!windowId) {
      log.warn('meeting-detected without window.id — ignoring')
      return
    }
    log.info(`Meeting detected (platform=${evt?.window?.platform}, window=${windowId})`)

    let uploadToken: string
    let uploadId: string
    try {
      const res = await this.backendClient.getRecallUploadToken(this.getLanguage())
      uploadToken = res.uploadToken
      uploadId = res.id
    } catch (err) {
      log.error('Could not mint Recall upload token — not recording:', err)
      return
    }

    try {
      await this.sdk.startRecording({ windowId, uploadToken })
    } catch (err) {
      log.error('RecallAiSdk.startRecording failed:', err)
      return
    }

    this.activeWindowId = windowId
    this.activeUploadId = uploadId
    this.pipeline.startRecallSession()
    // Hand the upload id to the renderer so it can tag the transcript for webhook correlation.
    this.sendToRenderer('recall:auto-start-meeting', { uploadId })
    log.success('Recall recording started')
  }

  private onTranscript(evt: any): void {
    const words: Array<{ text?: string }> = evt.data.data.words || []
    if (words.length === 0) return
    const text = words.map((w) => w.text ?? '').join(' ').trim()
    if (!text) return

    const name = evt.data.data.participant?.name
    const speaker = name && name !== 'Host' && name !== 'Guest' ? name : 'Speaker'

    this.pipeline.pushRecallTranscriptEntry({ speaker, text, source: 'system' })
  }

  /** Renderer-initiated stop (e.g. Alt+M while a Recall meeting is active). Stops
   *  the SDK recording without echoing an auto-stop back to the renderer. */
  async stopActiveRecording(): Promise<void> {
    if (!this.sdk || !this.activeWindowId) return
    this.suppressAutoStop = true
    const windowId = this.activeWindowId
    this.activeWindowId = null
    try {
      await this.sdk.stopRecording({ windowId })
    } catch (err) {
      log.error('RecallAiSdk.stopRecording failed:', err)
    }
  }

  get isInitialized(): boolean {
    return this.initialized
  }
}
