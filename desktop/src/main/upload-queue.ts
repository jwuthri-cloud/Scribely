import { EventEmitter } from 'events'
import Store from 'electron-store'
import { createLogger } from './logger'
import type { BackendClient, MeetingSyncPayload } from './backend-client'
import type { AuthService } from './auth/auth-service'

const log = createLogger('upload-queue')

export type UploadStatus = 'pending' | 'uploading' | 'success' | 'failed'

export interface UploadQueueItem {
  id: string
  transcriptFilepath: string
  recordingFilepath?: string
  sessionId?: string
  /** Unix ms — when the meeting ended */
  createdAt: number
  status: UploadStatus
  /** Set on failure */
  error?: string
  attemptCount: number
  lastAttemptAt?: number
  /** Set on successful upload — backend-assigned meeting ID */
  meetingId?: string
  /** Friendly display name (transcript filename without extension) */
  displayName: string
  /** Whether a recording file was part of this upload */
  hasRecording: boolean
}

interface UploadQueueStore {
  items: UploadQueueItem[]
}

/**
 * Persistent upload queue for meeting files (transcript JSON + optional webm).
 *
 * Files are already saved locally before enqueue is called, so they can be
 * re-uploaded at any time if the initial attempt fails.
 *
 * Retry triggers:
 *  - Immediate: attempted right after enqueue
 *  - App startup: flushPending() called after a short delay in index.ts
 *  - Network reconnect: flushPending() called when Electron's net fires 'online'
 *  - Manual: retryItem(id) called from the renderer UI
 */
export class UploadQueueService extends EventEmitter {
  private store: Store<UploadQueueStore>
  private backendClient: BackendClient
  private authService: AuthService

  constructor(backendClient: BackendClient, authService: AuthService) {
    super()
    this.store = new Store<UploadQueueStore>({
      name: 'upload-queue',
      defaults: { items: [] },
    })
    this.backendClient = backendClient
    this.authService = authService
  }

  /** Return a snapshot of all items (newest first). */
  getHistory(): UploadQueueItem[] {
    return [...this.store.get('items')]
  }

  private setItems(items: UploadQueueItem[]): void {
    this.store.set('items', items)
    this.emit('changed', items)
  }

  private upsertItem(updated: UploadQueueItem): void {
    const items = this.store.get('items')
    const idx = items.findIndex((i) => i.id === updated.id)
    if (idx >= 0) {
      items[idx] = updated
    } else {
      items.unshift(updated) // newest first
    }
    this.setItems(items)
  }

  /**
   * Add a meeting to the queue and immediately attempt the upload.
   * Returns the item ID.
   */
  enqueue(payload: MeetingSyncPayload): string {
    const id = crypto.randomUUID()
    const filename = payload.transcriptFilepath.split('/').pop() ?? 'transcript.json'
    // e.g. "transcript-2026-03-14_12-35-00" → "Meeting 2026-03-14 12:35"
    const displayName = filename
      .replace(/^transcript-/, '')
      .replace('.json', '')
      .replace(/_/g, ' ')

    const item: UploadQueueItem = {
      id,
      transcriptFilepath: payload.transcriptFilepath,
      recordingFilepath: payload.recordingFilepath,
      sessionId: payload.sessionId,
      createdAt: Date.now(),
      status: 'pending',
      attemptCount: 0,
      displayName,
      hasRecording: !!payload.recordingFilepath,
    }

    this.upsertItem(item)
    log.info(`Queued: ${id} (${displayName})`)
    // Fire-and-forget — don't block the caller
    void this._attemptItem(item)
    return id
  }

  private async _attemptItem(item: UploadQueueItem): Promise<void> {
    if (!this.backendClient.isConfigured) {
      log.info(`Backend not configured — skipping ${item.id}`)
      return
    }

    const authState = this.authService.getState()
    if (authState.mode !== 'authenticated') {
      log.info(`Not authenticated — skipping ${item.id}`)
      return
    }

    const token = this.authService.getSessionToken()
    if (!token) {
      log.info(`No session token — skipping ${item.id}`)
      return
    }

    // Mark as uploading
    const uploading: UploadQueueItem = {
      ...item,
      status: 'uploading',
      attemptCount: item.attemptCount + 1,
      lastAttemptAt: Date.now(),
    }
    this.upsertItem(uploading)

    try {
      const result = await this.backendClient.syncMeeting({
        transcriptFilepath: item.transcriptFilepath,
        recordingFilepath: item.recordingFilepath,
        sessionId: item.sessionId,
      })

      if (result.success) {
        this.upsertItem({
          ...uploading,
          status: 'success',
          meetingId: result.meetingId,
          error: undefined,
        })
        log.success(`Uploaded: ${item.id} → meetingId=${result.meetingId}`)
      } else {
        this.upsertItem({
          ...uploading,
          status: 'failed',
          error: result.message,
        })
        log.warn(`Upload failed: ${item.id} — ${result.message}`)
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown error'
      this.upsertItem({
        ...uploading,
        status: 'failed',
        error: msg,
      })
      log.error(`Upload error: ${item.id} — ${msg}`)

      // Token expired (401) — invalidate so we don't keep retrying with a bad token
      if (msg.includes('401') || msg.includes('Authentication failed')) {
        this.authService.invalidateToken()
        this.emit('token-expired')
      }
    }
  }

  /** Retry all pending and failed items. Called on startup and network reconnect. */
  async flushPending(): Promise<void> {
    const pending = this.store
      .get('items')
      .filter((i) => i.status === 'pending' || i.status === 'failed')

    if (pending.length === 0) return

    log.info(`Flushing ${pending.length} pending upload(s)`)
    for (const item of pending) {
      await this._attemptItem(item)
    }
  }

  /** Manually retry a specific item by ID. */
  async retryItem(id: string): Promise<void> {
    const item = this.store.get('items').find((i) => i.id === id)
    if (!item) {
      log.warn(`retryItem: not found: ${id}`)
      return
    }
    // Reset status before retrying so _attemptItem doesn't re-check 'uploading' guard
    const reset: UploadQueueItem = { ...item, status: 'pending', error: undefined }
    this.upsertItem(reset)
    await this._attemptItem(reset)
  }

  /** Remove a specific item from history. */
  clearItem(id: string): void {
    this.setItems(this.store.get('items').filter((i) => i.id !== id))
  }

  /** Remove all items from history. */
  clearAll(): void {
    this.setItems([])
  }
}
