import { desktopCapturer, ipcMain, app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { mkdir, writeFile, appendFile } from 'fs/promises'

/**
 * Main-process screen recorder.
 *
 * Flow:
 * 1. Renderer calls recording:start → main creates file
 * 2. Main temporarily swaps the displayMediaRequestHandler to auto-select the screen
 * 3. Renderer calls getDisplayMedia → handler auto-selects (no picker)
 * 4. After stream is acquired, handler is restored to system picker mode
 * 5. Renderer MediaRecorder sends chunks to main for incremental disk writes
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
   * Install the auto-select handler (no picker).
   * After one getDisplayMedia call completes, restores the system picker handler.
   */
  private _installAutoSelectHandler(): void {
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({ types: ['screen'] })
          if (sources.length > 0) {
            console.log(`[screen-recorder] Auto-selecting: "${sources[0].name}" (${sources[0].id})`)
            callback({ video: sources[0], audio: 'loopback' })
          } else {
            console.warn('[screen-recorder] No screen sources available')
            callback({})
          }
        } catch (err) {
          console.error('[screen-recorder] Auto-select error:', err)
          callback({})
        }
        // Restore the system picker handler after this request completes
        this._installSystemPickerHandler()
      },
    )
  }

  /**
   * Install the system picker handler (normal mode).
   * Shows the macOS ScreenCaptureKit picker so user can choose tab/window.
   */
  _installSystemPickerHandler(): void {
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({ types: ['screen'] })
          if (sources.length > 0) {
            console.log('[display-media] Fallback (system picker unavailable): using primary screen')
            callback({ video: sources[0], audio: 'loopback' })
          } else {
            callback({})
          }
        } catch (err) {
          console.error('[display-media] Fallback handler error:', err)
          callback({})
        }
      },
      { useSystemPicker: true },
    )
  }

  private _registerIPC() {
    ipcMain.handle('recording:start', async () => {
      return this.start()
    })

    ipcMain.handle('recording:stop', async () => {
      return this.stop()
    })

    ipcMain.handle(
      'recording:write-chunk',
      async (_event, payload: { data: ArrayBuffer }) => {
        if (!this.filepath) return
        this.chunkCount++
        await appendFile(this.filepath, Buffer.from(payload.data))
        if (this.chunkCount <= 3 || this.chunkCount % 10 === 0) {
          console.log(
            `[screen-recorder] Chunk #${this.chunkCount}: ${(payload.data.byteLength / 1024).toFixed(1)}KB → ${this.filepath.split('/').pop()}`,
          )
        }
      },
    )
  }

  async start(): Promise<{ success: boolean; filepath?: string; error?: string }> {
    if (this.isRecording) {
      return { success: true, filepath: this.filepath! }
    }

    try {
      const dir = join(app.getPath('documents'), 'AssistMe', 'recordings')
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
      console.log(`[screen-recorder] Recording file created: ${this.filepath}`)

      // Keep the system picker so user can choose which tab/window to record
      this._installSystemPickerHandler()

      // Tell renderer to call getDisplayMedia
      this.win?.webContents.send('recording:start-capture', {
        filepath: this.filepath,
      })

      this.isRecording = true
      return { success: true, filepath: this.filepath }
    } catch (err) {
      console.error('[screen-recorder] Failed to start:', err)
      this._installSystemPickerHandler()
      return { success: false, error: String(err) }
    }
  }

  async stop(): Promise<{ filepath: string | null }> {
    if (!this.isRecording) {
      return { filepath: this.filepath }
    }

    console.log(`[screen-recorder] Stopping recording (${this.chunkCount} chunks written)`)
    this.win?.webContents.send('recording:stop-capture')
    this.isRecording = false
    this._installSystemPickerHandler()

    const fp = this.filepath
    return { filepath: fp }
  }

  getFilepath(): string | null {
    return this.filepath
  }

  getIsRecording(): boolean {
    return this.isRecording
  }
}
