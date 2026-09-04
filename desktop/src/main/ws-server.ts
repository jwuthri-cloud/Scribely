import { EventEmitter } from 'events'
import { WebSocketServer, WebSocket } from 'ws'
import { createLogger } from './logger'

const log = createLogger('ws-server')

// ── Binary message protocol ────────────────────────────
// 1-byte type header:
//   0x01 = audio PCM frame (rest is Float32Array at 16kHz)
//   0x02 = video chunk (rest is WebM blob)
//   0x03 = control message (rest is JSON string)
const MSG_AUDIO = 0x01
const MSG_VIDEO = 0x02
const MSG_CONTROL = 0x03
const MSG_MIC = 0x04

export interface ExtensionWsServerOptions {
  port?: number
  host?: string
}

/**
 * Local WebSocket server that receives audio/video streams from the
 * Chrome extension's offscreen document.
 *
 * IMPORTANT: The popup's connectivity check also briefly opens a WebSocket.
 * We only consider a client as the "capture client" after it sends a
 * { type: "hello" } control message. Until then, connections are anonymous
 * and do NOT trigger the connected/disconnected events.
 */
export class ExtensionWsServer extends EventEmitter {
  private wss: WebSocketServer | null = null
  /** The active capture client (sent a hello handshake) */
  private captureClient: WebSocket | null = null
  /** Sample rate reported by the capture client (defaults to 16000) */
  private clientSampleRate: number = 16000
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

  /** True only when the offscreen capture document is connected (sent hello) */
  get isClientConnected(): boolean {
    return this.captureClient !== null && this.captureClient.readyState === WebSocket.OPEN
  }

  /** Start listening for extension connections */
  start(): void {
    if (this.wss) return

    this.wss = new WebSocketServer({
      port: this._port,
      host: this._host,
    })

    this.wss.on('listening', () => {
      log.success(`Listening on ws://${this._host}:${this._port}`)
    })

    this.wss.on('connection', (ws) => {
      log.debug('New WebSocket connection (awaiting hello handshake)')

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (!isBinary || data.length < 2) return
        this._handleMessage(ws, data)
      })

      ws.on('close', () => {
        if (ws === this.captureClient) {
          log.info('Capture client disconnected')
          this.captureClient = null
          this.emit('disconnected')
        }
        // Anonymous connections closing is a no-op
      })

      ws.on('error', (err) => {
        log.error('Client error:', err)
        if (ws === this.captureClient) {
          this.emit('error', err)
        }
      })
    })

    this.wss.on('error', (err) => {
      log.error('Server error:', err)
      this.emit('error', err)
    })
  }

  /** Stop the WebSocket server */
  stop(): void {
    if (this.captureClient) {
      this.captureClient.close()
      this.captureClient = null
    }
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
    log.info('Stopped')
  }

  /**
   * Forward mic PCM from Electron back to the offscreen document so it can
   * be mixed into the WebM recording.  The offscreen doc cannot capture the
   * mic itself (hidden context, no permission prompt), so Electron relays it.
   */
  sendMicAudio(pcm: Float32Array): void {
    if (!this.captureClient || this.captureClient.readyState !== WebSocket.OPEN) return
    const header = Buffer.alloc(1)
    header[0] = MSG_MIC
    const body = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    this.captureClient.send(Buffer.concat([header, body]))
  }

  /** Send a control message to the connected capture client */
  sendControl(payload: Record<string, unknown>): void {
    if (!this.captureClient || this.captureClient.readyState !== WebSocket.OPEN) return
    const json = JSON.stringify(payload)
    const header = Buffer.alloc(1)
    header[0] = MSG_CONTROL
    const body = Buffer.from(json, 'utf-8')
    this.captureClient.send(Buffer.concat([header, body]))
  }

  /**
   * Send stop-capture to the extension and close the socket from the server
   * side after a short delay to guarantee the 'disconnected' event fires
   * even if the client never responds.
   */
  stopCaptureClient(): void {
    if (!this.captureClient || this.captureClient.readyState !== WebSocket.OPEN) {
      // Client already gone — make sure disconnected fires anyway so
      // the Electron auto-stop logic doesn't get stuck.
      if (this.captureClient) {
        this.captureClient = null
        this.emit('disconnected')
      }
      return
    }

    this.sendControl({ type: 'stop-capture' })
    const client = this.captureClient

    // After 500ms, force-close + emit disconnected if the client hasn't
    // cleanly disconnected yet (e.g. extension crashed or is unresponsive).
    setTimeout(() => {
      if (client.readyState !== WebSocket.CLOSED && client.readyState !== WebSocket.CLOSING) {
        client.close(1000, 'Stop capture requested')
      }
      // If captureClient is still set (capture-stopped control msg never arrived),
      // emit disconnected so Electron doesn't stay in a stale state.
      if (this.captureClient === client) {
        this.captureClient = null
        this.emit('disconnected')
      }
    }, 500)
  }

  // ── Internal message parsing ─────────────────────────

  private _handleMessage(ws: WebSocket, data: Buffer): void {
    const type = data[0]
    const payload = data.subarray(1)

    switch (type) {
      case MSG_AUDIO: {
        if (ws !== this.captureClient) return // ignore audio from non-capture clients
        // Copy into an aligned buffer — the ws Buffer's byteOffset after
        // subarray(1) is not guaranteed to be a multiple of 4.
        const aligned = new ArrayBuffer(payload.byteLength)
        new Uint8Array(aligned).set(payload)
        const pcm = new Float32Array(aligned)
        this.emit('audioFrame', pcm, this.clientSampleRate)
        break
      }

      case MSG_VIDEO: {
        if (ws !== this.captureClient) return
        this.emit('videoChunk', Buffer.from(payload))
        break
      }

      case MSG_CONTROL: {
        try {
          const msg = JSON.parse(payload.toString('utf-8'))
          this._handleControl(ws, msg)
        } catch {
          log.warn('Invalid control message')
        }
        break
      }

      default:
        log.warn(`Unknown message type: 0x${type.toString(16)}`)
    }
  }

  private _handleControl(ws: WebSocket, msg: Record<string, unknown>): void {
    log.debug('Control message:', msg)

    if (msg.type === 'hello' && msg.source === 'chrome-extension') {
      // This is the real capture client (offscreen document).
      // Kick any previous capture client.
      if (this.captureClient && this.captureClient !== ws) {
        this.captureClient.close(4001, 'Replaced by new capture client')
        this.captureClient = null
      }
      this.captureClient = ws
      if (typeof msg.sampleRate === 'number' && msg.sampleRate > 0) {
        this.clientSampleRate = msg.sampleRate
      } else {
        this.clientSampleRate = 16000
      }
      log.success(`Capture client identified (sampleRate=${this.clientSampleRate}) — extension capture active`)
      this.emit('connected')
    }

    if (msg.type === 'doc' && ws === this.captureClient) {
      this.emit('doc', msg as { text?: string; error?: string })
    }

    if (msg.type === 'capture-stopped' && ws === this.captureClient) {
      log.info('Capture client signaled stop')
      this.captureClient = null
      this.emit('disconnected')
      try {
        ws.close(1000, 'Stop acknowledged')
      } catch {
        // Client may have already closed
      }
    }
  }
}
