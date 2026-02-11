import { desktopCapturer, ipcMain, app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { mkdir, writeFile, appendFile } from 'fs/promises'

interface SourceInfo {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnailDataUrl: string
}

/**
 * Main-process screen recorder.
 *
 * Flow:
 * 1. Renderer calls recording:start → main lists sources, sends them to renderer
 * 2. Renderer shows a picker UI, user picks a source
 * 3. Renderer calls recording:select-source with the chosen ID
 * 4. Main installs a handler that auto-selects that source, tells renderer to getDisplayMedia
 * 5. Renderer MediaRecorder sends chunks to main for incremental disk writes
 *
 * Note: Electron does not support Chromium's built-in tab picker — getDisplayMedia always
 * goes through setDisplayMediaRequestHandler. We use desktopCapturer.getSources to list
 * all screens and windows (which includes browser windows with their tab titles).
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
   * Install handler that auto-selects a specific source by ID.
   */
  private _installSourceHandler(sourceId: string): void {
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
          })
          const match = sources.find((s) => s.id === sourceId) || sources[0]
          if (match) {
            console.log(`[screen-recorder] Selecting source: "${match.name}" (${match.id})`)
            callback({ video: match, audio: 'loopback' })
          } else {
            console.warn('[screen-recorder] No matching source found')
            callback({})
          }
        } catch (err) {
          console.error('[screen-recorder] Source handler error:', err)
          callback({})
        }
      },
    )
  }

  /**
   * Default handler for non-recording display media requests.
   */
  _installDefaultHandler(): void {
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({ types: ['screen'] })
          if (sources.length > 0) {
            callback({ video: sources[0], audio: 'loopback' })
          } else {
            callback({})
          }
        } catch (err) {
          console.error('[screen-recorder] Default handler error:', err)
          callback({})
        }
      },
    )
  }

  private _registerIPC() {
    ipcMain.handle('recording:start', async () => {
      return this.start()
    })

    ipcMain.handle('recording:stop', async () => {
      return this.stop()
    })

    // Renderer picked a source from the custom picker
    ipcMain.handle('recording:select-source', async (_event, sourceId: string) => {
      return this._onSourceSelected(sourceId)
    })

    ipcMain.handle(
      'recording:write-chunk',
      async (_event, payload: { data: Uint8Array }) => {
        if (!this.filepath) return
        this.chunkCount++
        const buf = Buffer.from(payload.data)
        await appendFile(this.filepath, buf)
        if (this.chunkCount <= 3 || this.chunkCount % 10 === 0) {
          console.log(
            `[screen-recorder] Chunk #${this.chunkCount}: ${(buf.byteLength / 1024).toFixed(1)}KB → ${this.filepath.split('/').pop()}`,
          )
        }
      },
    )
  }

  /**
   * Step 1: Create file, list sources, send to renderer for picking.
   */
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

      // Get available sources for the picker (screens + windows including browser tabs)
      const rawSources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
      })

      const sources: SourceInfo[] = rawSources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnailDataUrl: s.thumbnail.toDataURL(),
      }))

      console.log(`[screen-recorder] Found ${sources.length} sources, sending picker to renderer`)

      // Send sources to renderer so it can show a picker
      this.win?.webContents.send('recording:show-picker', {
        filepath: this.filepath,
        sources,
      })

      return { success: true, filepath: this.filepath }
    } catch (err) {
      console.error('[screen-recorder] Failed to start:', err)
      return { success: false, error: String(err) }
    }
  }

  /**
   * Step 2: User picked a source — install the handler and tell renderer to getDisplayMedia.
   */
  private async _onSourceSelected(sourceId: string): Promise<void> {
    console.log(`[screen-recorder] User selected source: ${sourceId}`)

    // Install handler that will auto-select this source when getDisplayMedia is called
    this._installSourceHandler(sourceId)

    // Now tell renderer to call getDisplayMedia (the handler will provide the chosen source)
    this.win?.webContents.send('recording:start-capture', {
      filepath: this.filepath,
    })

    this.isRecording = true
  }

  async stop(): Promise<{ filepath: string | null }> {
    if (!this.isRecording) {
      return { filepath: this.filepath }
    }

    console.log(`[screen-recorder] Stopping recording (${this.chunkCount} chunks written)`)
    this.win?.webContents.send('recording:stop-capture')
    this.isRecording = false
    this._installDefaultHandler()

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
