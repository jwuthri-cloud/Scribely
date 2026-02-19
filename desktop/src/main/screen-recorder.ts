import { desktopCapturer, ipcMain, app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { mkdir, writeFile, appendFile, unlink } from 'fs/promises'
import { createLogger } from './logger'

const log = createLogger('screen-recorder')

export interface SourceInfo {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnailDataUrl: string
}

/**
 * Main-process screen recorder.
 *
 * Flow:
 * 1. Renderer calls recording:start → main creates file
 * 2. Main fetches desktopCapturer sources (screens + windows with thumbnails)
 * 3. Main sends sources to renderer via recording:show-picker
 * 4. User picks a source → renderer sends recording:select-source
 * 5. Main installs a handler that auto-selects that source
 * 6. Main sends recording:start-capture → renderer calls getDisplayMedia()
 * 7. MediaRecorder sends chunks to main for incremental disk writes
 * 8. On stop, main sends recording:stop-capture
 */
export class ScreenRecorder {
  private win: BrowserWindow | null = null
  private isRecording = false
  private filepath: string | null = null
  private chunkCount = 0

  constructor() {
    this._registerIPC()
  }

  setWindow(win: BrowserWindow) {
    this.win = win
  }

  /**
   * Default handler — auto-selects primary screen.
   * Used when NOT recording.
   */
  _installDefaultHandler(): void {
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] })
        if (sources.length > 0) {
          callback({
            video: sources[0],
            audio: request.audioRequested ? 'loopback' : undefined,
          })
        } else {
          callback({})
        }
      } catch (err) {
        log.error('Default handler error:', err)
        callback({})
      }
    })
  }

  /**
   * Install a handler that auto-selects a specific source by ID.
   * Requested audio is captured via system loopback (requires Chromium flags).
   */
  private _installSourceHandler(sourceId: string): void {
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const allSources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
        })
        const match = allSources.find((s) => s.id === sourceId)
        if (match) {
          log.info(
            `Auto-selecting source: ${match.name} (${match.id}), audio=${request.audioRequested ? 'loopback' : 'none'}`,
          )
          callback({
            video: match,
            audio: request.audioRequested ? 'loopback' : undefined,
          })
        } else {
          log.warn(`Source ${sourceId} not found, falling back to screen`)
          const screens = allSources.filter((s) => s.id.startsWith('screen:'))
          if (screens.length > 0) {
            callback({
              video: screens[0],
              audio: request.audioRequested ? 'loopback' : undefined,
            })
          } else {
            callback({})
          }
        }
      } catch (err) {
        log.error('Source handler error:', err)
        callback({})
      }
    })
  }

  private _registerIPC() {
    ipcMain.handle('recording:start', async () => {
      return this.start()
    })

    ipcMain.handle('recording:stop', async () => {
      return this.stop()
    })

    // User dismissed the picker (X or Cancel) — cancel recording and clean up
    ipcMain.handle('recording:cancel', async () => {
      return this.cancel()
    })

    // User picked a source from the custom picker
    ipcMain.handle('recording:select-source', async (_event, sourceId: string) => {
      this._onSourceSelected(sourceId)
    })

    ipcMain.handle(
      'recording:write-chunk',
      async (_event, payload: { data: Uint8Array }) => {
        if (!this.filepath) return
        this.chunkCount++
        const buf = Buffer.from(payload.data)
        await appendFile(this.filepath, buf)
        if (this.chunkCount <= 3 || this.chunkCount % 10 === 0) {
          log.info(
            `[screen-recorder] Chunk #${this.chunkCount}: ${(buf.byteLength / 1024).toFixed(1)}KB → ${this.filepath.split('/').pop()}`,
          )
        }
      },
    )
  }

  /**
   * Called when the user selects a source from the picker.
   * Installs the auto-select handler and tells the renderer to call getDisplayMedia.
   */
  private _onSourceSelected(sourceId: string): void {
    log.info(`[screen-recorder] User selected source: ${sourceId}`)

    // Install handler that will auto-select this source
    this._installSourceHandler(sourceId)

    // Tell renderer to call getDisplayMedia — the handler will auto-resolve it
    this.win?.webContents.send('recording:start-capture', {
      filepath: this.filepath!,
    })
  }

  async start(): Promise<{ success: boolean; filepath?: string; error?: string }> {
    if (this.isRecording) {
      return { success: true, filepath: this.filepath! }
    }

    try {
      const dir = join(app.getPath('documents'), 'Scribely', 'recordings')
      await mkdir(dir, { recursive: true })

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19)
      const filename = `meeting-${timestamp}.webm`
      this.filepath = join(dir, filename)
      this.chunkCount = 0

      await writeFile(this.filepath, Buffer.alloc(0))
      log.info(`[screen-recorder] Recording file created: ${this.filepath}`)

      // Get available sources for the picker (screens + windows)
      // Window names include the active tab title (e.g. "YouTube — Google Chrome")
      const rawSources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
      })

      // Filter out our own overlay window
      const ownWindowId = this.win?.getMediaSourceId()
      const sources: SourceInfo[] = rawSources
        .filter((s) => s.id !== ownWindowId)
        .map((s) => ({
          id: s.id,
          name: s.name,
          type: s.id.startsWith('screen:') ? ('screen' as const) : ('window' as const),
          thumbnailDataUrl: s.thumbnail.toDataURL(),
        }))

      log.info(
        `[screen-recorder] Sending ${sources.length} sources to picker (${sources.filter((s) => s.type === 'screen').length} screens, ${sources.filter((s) => s.type === 'window').length} windows)`,
      )

      // Send sources to renderer — it will show the picker UI
      this.win?.webContents.send('recording:show-picker', {
        filepath: this.filepath,
        sources,
      })

      this.isRecording = true
      return { success: true, filepath: this.filepath }
    } catch (err) {
      log.error('[screen-recorder] Failed to start:', err)
      return { success: false, error: String(err) }
    }
  }

  async stop(): Promise<{ filepath: string | null }> {
    if (!this.isRecording) {
      return { filepath: this.filepath }
    }

    log.info(`[screen-recorder] Stopping recording (${this.chunkCount} chunks written)`)
    this.win?.webContents.send('recording:stop-capture')
    this.isRecording = false
    this._installDefaultHandler()

    const fp = this.filepath
    return { filepath: fp }
  }

  /**
   * Cancel recording when user dismisses the picker without selecting.
   * Deletes the empty file and resets state.
   */
  async cancel(): Promise<void> {
    if (!this.isRecording) return

    log.info(`[screen-recorder] Cancelling recording (picker dismissed)`)
    this.win?.webContents.send('recording:stop-capture')
    this.isRecording = false
    this._installDefaultHandler()

    // Delete empty file if no chunks were written
    if (this.filepath && this.chunkCount === 0) {
      try {
        await unlink(this.filepath)
        log.info(`[screen-recorder] Deleted empty file: ${this.filepath}`)
      } catch (err) {
        log.warn(`[screen-recorder] Failed to delete empty file:`, err)
      }
    }
    this.filepath = null
  }

  /**
   * Start recording for external sources (e.g. Chrome extension) without
   * showing the source picker or touching the renderer.  Creates the output
   * file and sets isRecording so writeExternalChunk() accepts data.
   */
  async startExternalRecording(): Promise<{ success: boolean; filepath?: string; error?: string }> {
    if (this.isRecording) {
      return { success: true, filepath: this.filepath! }
    }

    try {
      const dir = join(app.getPath('documents'), 'Scribely', 'recordings')
      await mkdir(dir, { recursive: true })

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19)
      const filename = `meeting-${timestamp}.webm`
      this.filepath = join(dir, filename)
      this.chunkCount = 0

      await writeFile(this.filepath, Buffer.alloc(0))
      log.info(`[screen-recorder] External recording file created: ${this.filepath}`)

      this.isRecording = true
      return { success: true, filepath: this.filepath }
    } catch (err) {
      log.error('[screen-recorder] Failed to start external recording:', err)
      return { success: false, error: String(err) }
    }
  }

  /**
   * Stop an external recording without sending stop-capture to the renderer.
   */
  async stopExternalRecording(): Promise<{ filepath: string | null }> {
    if (!this.isRecording) {
      return { filepath: this.filepath }
    }

    log.info(`[screen-recorder] Stopping external recording (${this.chunkCount} chunks written)`)
    this.isRecording = false

    const fp = this.filepath
    return { filepath: fp }
  }

  getFilepath(): string | null {
    return this.filepath
  }

  getIsRecording(): boolean {
    return this.isRecording
  }

  /**
   * Write an external video chunk to the recording file (e.g. from Chrome
   * extension WebSocket). If no recording is active, the chunk is ignored.
   */
  async writeExternalChunk(data: Buffer): Promise<void> {
    if (!this.filepath || !this.isRecording) return
    this.chunkCount++
    await appendFile(this.filepath, data)
    if (this.chunkCount <= 3 || this.chunkCount % 10 === 0) {
      log.info(
        `[screen-recorder] External chunk #${this.chunkCount}: ${(data.byteLength / 1024).toFixed(1)}KB → ${this.filepath.split('/').pop()}`,
      )
    }
  }

}
