import { EventEmitter } from 'events'
import { WebSocketServer, WebSocket } from 'ws'

// ── Binary message protocol ────────────────────────────
// 1-byte type header:
//   0x01 = audio PCM frame (rest is Float32Array at 16kHz)
//   0x02 = video chunk (rest is WebM blob)
//   0x03 = control message (rest is JSON string)
const MSG_AUDIO = 0x01
const MSG_VIDEO = 0x02
const MSG_CONTROL = 0x03

export interface ExtensionWsServerOptions {
  port?: number
  host?: string
}

export interface ExtensionWsServerEvents {
  audioFrame: (pcm: Float32Array, sampleRate: number) => void
  videoChunk: (data: Buffer) => void
  connected: () => void
  disconnected: () => void
  error: (err: Error) => void
}

/**
 * Local WebSocket server that receives audio/video streams from the
 * Chrome extension's offscreen document.
 *
 * Audio frames arrive as raw PCM Float32 at 16kHz, tagged as "system" source.
 * Video chunks arrive as WebM blobs for screen recording.
 */
export class ExtensionWsServer extends EventEmitter {
  private wss: WebSocketServer | null = null
  private client: WebSocket | null = null
  private _port: number
  private _host: string

  constructor(options: ExtensionWsServerOptions = {}) {
    super()
    this._port = options.port ?? 9876
    this._host = options.host ?? '127.0.0.1'
  }

  get port(): number {
    return this._port
  }

  get isClientConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN
  }

  /** Start listening for extension connections */
  start(): void {
    if (this.wss) return

    this.wss = new WebSocketServer({
      port: this._port,
      host: this._host,
    })

    this.wss.on('listening', () => {
      console.log(`[ws-server] Listening on ws://${this._host}:${this._port}`)
    })

    this.wss.on('connection', (ws) => {
      // Only allow one client at a time
      if (this.client) {
        console.log('[ws-server] Rejecting extra connection — one client already connected')
        ws.close(4000, 'Only one client allowed')
        return
      }

      this.client = ws
      console.log('[ws-server] Chrome extension connected')
      this.emit('connected')

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (!isBinary || data.length < 2) return
        this._handleMessage(data)
      })

      ws.on('close', () => {
        console.log('[ws-server] Chrome extension disconnected')
        this.client = null
        this.emit('disconnected')
      })

      ws.on('error', (err) => {
        console.error('[ws-server] Client error:', err)
        this.emit('error', err)
      })
    })

    this.wss.on('error', (err) => {
      console.error('[ws-server] Server error:', err)
      this.emit('error', err)
    })
  }

  /** Stop the WebSocket server */
  stop(): void {
    if (this.client) {
      this.client.close()
      this.client = null
    }
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
    console.log('[ws-server] Stopped')
  }

  /** Send a control message to the connected extension */
  sendControl(payload: Record<string, unknown>): void {
    if (!this.client || this.client.readyState !== WebSocket.OPEN) return
    const json = JSON.stringify(payload)
    const header = Buffer.alloc(1)
    header[0] = MSG_CONTROL
    const body = Buffer.from(json, 'utf-8')
    this.client.send(Buffer.concat([header, body]))
  }

  // ── Internal message parsing ─────────────────────────

  private _handleMessage(data: Buffer): void {
    const type = data[0]
    const payload = data.subarray(1)

    switch (type) {
      case MSG_AUDIO: {
        // Payload is raw PCM Float32 at 16kHz.
        // Copy into an aligned buffer — the ws Buffer's byteOffset after
        // subarray(1) is not guaranteed to be a multiple of 4.
        const aligned = new ArrayBuffer(payload.byteLength)
        new Uint8Array(aligned).set(payload)
        const pcm = new Float32Array(aligned)
        this.emit('audioFrame', pcm, 16000)
        break
      }

      case MSG_VIDEO: {
        // Payload is WebM blob data
        this.emit('videoChunk', Buffer.from(payload))
        break
      }

      case MSG_CONTROL: {
        try {
          const msg = JSON.parse(payload.toString('utf-8'))
          this._handleControl(msg)
        } catch {
          console.warn('[ws-server] Invalid control message')
        }
        break
      }

      default:
        console.warn(`[ws-server] Unknown message type: 0x${type.toString(16)}`)
    }
  }

  private _handleControl(msg: Record<string, unknown>): void {
    console.log('[ws-server] Control message:', JSON.stringify(msg))
    // Future: handle start/stop/status messages from extension
  }
}
