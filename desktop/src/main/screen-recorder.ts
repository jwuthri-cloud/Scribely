import { desktopCapturer, ipcMain, app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { mkdir, writeFile, appendFile, open } from 'fs/promises'
import type { FileHandle } from 'fs/promises'

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

  // Separate mic WAV file (synced with the WebM video)
  private micWavPath: string | null = null
  private micWavFd: FileHandle | null = null
  private micWavDataSize = 0
  private videoStarted = false // true after the first video chunk arrives

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
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
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
    })
  }

  /**
   * Install a handler that auto-selects a specific source by ID.
   */
  private _installSourceHandler(sourceId: string): void {
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const allSources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
        })
        const match = allSources.find((s) => s.id === sourceId)
        if (match) {
          console.log(`[screen-recorder] Auto-selecting source: ${match.name} (${match.id})`)
          callback({ video: match, audio: 'loopback' })
        } else {
          console.warn(`[screen-recorder] Source ${sourceId} not found, falling back to screen`)
          const screens = allSources.filter((s) => s.id.startsWith('screen:'))
          if (screens.length > 0) {
            callback({ video: screens[0], audio: 'loopback' })
          } else {
            callback({})
          }
        }
      } catch (err) {
        console.error('[screen-recorder] Source handler error:', err)
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
          console.log(
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
    console.log(`[screen-recorder] User selected source: ${sourceId}`)

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

      console.log(
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
      console.error('[screen-recorder] Failed to start:', err)
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
    this._installDefaultHandler()

    const fp = this.filepath
    return { filepath: fp }
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
      console.log(`[screen-recorder] External recording file created: ${this.filepath}`)

      // Create a companion WAV file for mic audio (synced with the video)
      const micFilename = `meeting-${timestamp}-mic.wav`
      this.micWavPath = join(dir, micFilename)
      this.micWavFd = await open(this.micWavPath, 'w')
      await this.micWavFd.write(this._createWavHeader(0)) // placeholder header
      this.micWavDataSize = 0
      console.log(`[screen-recorder] Mic WAV file created: ${this.micWavPath}`)

      this.isRecording = true
      return { success: true, filepath: this.filepath }
    } catch (err) {
      console.error('[screen-recorder] Failed to start external recording:', err)
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

    console.log(`[screen-recorder] Stopping external recording (${this.chunkCount} chunks written)`)
    this.isRecording = false

    // Finalize the mic WAV: rewrite the header with the actual data size
    if (this.micWavFd) {
      try {
        const header = this._createWavHeader(this.micWavDataSize)
        await this.micWavFd.write(header, 0, header.length, 0)
        await this.micWavFd.close()
        console.log(
          `[screen-recorder] Mic WAV finalized: ${this.micWavPath} ` +
            `(${(this.micWavDataSize / 1024).toFixed(0)}KB)`,
        )
      } catch (err) {
        console.error('[screen-recorder] Failed to finalize mic WAV:', err)
      }
      this.micWavFd = null
    }

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
    if (!this.videoStarted) this.videoStarted = true
    await appendFile(this.filepath, data)
    if (this.chunkCount <= 3 || this.chunkCount % 10 === 0) {
      console.log(
        `[screen-recorder] External chunk #${this.chunkCount}: ${(data.byteLength / 1024).toFixed(1)}KB → ${this.filepath.split('/').pop()}`,
      )
    }
  }

  /**
   * Write mic PCM (Float32, 16 kHz mono) to the companion WAV file.
   * Converts to 16-bit signed integers for maximum compatibility.
   */
  async writeMicPcm(pcm: Float32Array): Promise<void> {
    if (!this.micWavFd || !this.isRecording) return
    try {
      const int16 = new Int16Array(pcm.length)
      for (let i = 0; i < pcm.length; i++) {
        const s = Math.max(-1, Math.min(1, pcm[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      const buf = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength)
      await this.micWavFd.write(buf)
      this.micWavDataSize += buf.byteLength
    } catch (err) {
      console.error('[screen-recorder] Failed to write mic PCM:', err)
    }
  }

  /**
   * Create a standard WAV header (16-bit PCM, 16 kHz, mono).
   * dataSize = 0 for the initial placeholder; updated on stop.
   */
  private _createWavHeader(dataSize: number): Buffer {
    const sampleRate = 16000
    const numChannels = 1
    const bitsPerSample = 16
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
    const blockAlign = (numChannels * bitsPerSample) / 8

    const header = Buffer.alloc(44)
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + dataSize, 4)
    header.write('WAVE', 8)
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16) // fmt chunk size
    header.writeUInt16LE(1, 20) // PCM format
    header.writeUInt16LE(numChannels, 22)
    header.writeUInt32LE(sampleRate, 24)
    header.writeUInt32LE(byteRate, 28)
    header.writeUInt16LE(blockAlign, 32)
    header.writeUInt16LE(bitsPerSample, 34)
    header.write('data', 36)
    header.writeUInt32LE(dataSize, 40)
    return header
  }
}
