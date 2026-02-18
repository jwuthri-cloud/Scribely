/**
 * NativeHelperBridge — UDS client that manages the NativeHelper Swift daemon.
 *
 * Responsibilities:
 * - Spawn the NativeHelper binary as a child process
 * - Connect to its Unix Domain Socket (length-prefixed protobuf)
 * - Deserialize NativeMessage → typed EventEmitter events
 * - Serialize ControlMessage for outbound commands
 * - Handle reconnection on disconnect / process crash
 */

import { EventEmitter } from 'events'
import { createLogger } from './logger'

const log = createLogger('native-bridge')
import { ChildProcess, spawn, execSync } from 'child_process'
import net from 'net'
import path from 'path'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { app } from 'electron'
import {
  loadProtoSchema,
  encodeControlMessage,
  parseLengthPrefixedFrames,
  type AudioFrame,
  type StatusUpdate,
  type MeetingEvent,
  type MetricsUpdate,
  type ErrorEvent,
  type DecodedNativeMessage,
} from './generated/messages'

// ── Types ──────────────────────────────────────────────────

export interface NativeBridgeStatus {
  connected: boolean
  processRunning: boolean
  captureState: string // "idle" | "capturing" | "paused" | "error"
  micActive: boolean
  systemAudioActive: boolean
}

export interface NativeBridgeEvents {
  'audio-frame': (data: {
    source: string
    pcm: Float32Array
    sampleRate: number
    timestamp: number
    numSamples: number
  }) => void
  status: (data: StatusUpdate) => void
  'meeting-event': (data: MeetingEvent) => void
  metrics: (data: MetricsUpdate) => void
  error: (data: ErrorEvent) => void
  connected: () => void
  disconnected: () => void
  'process-exit': (code: number | null, signal: string | null) => void
}

// ── Constants ──────────────────────────────────────────────

const SOCKET_DIR = path.join(
  app.getPath('appData'),
  'Scribely',
)
const DEFAULT_SOCKET_PATH = path.join(SOCKET_DIR, 'scribely.sock')

/** Delay between reconnection attempts (ms) */
const RECONNECT_DELAY_MS = 1000

/** Max reconnection attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 10

/** Time to wait for socket to appear after spawning the process (ms) */
const SOCKET_WAIT_TIMEOUT_MS = 5000

/** Interval to poll for socket file after spawn (ms) */
const SOCKET_POLL_INTERVAL_MS = 100

// ── NativeHelperBridge ─────────────────────────────────────

export class NativeHelperBridge extends EventEmitter {
  private socket: net.Socket | null = null
  private childProcess: ChildProcess | null = null
  private socketPath: string
  private binaryPath: string
  private readBuffer: Buffer = Buffer.alloc(0)
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isShuttingDown = false
  private protoLoaded = false

  // Cached status from last StatusUpdate
  private _status: NativeBridgeStatus = {
    connected: false,
    processRunning: false,
    captureState: 'idle',
    micActive: false,
    systemAudioActive: false,
  }

  constructor(options?: { socketPath?: string; binaryPath?: string }) {
    super()
    this.socketPath = options?.socketPath ?? DEFAULT_SOCKET_PATH
    this.binaryPath =
      options?.binaryPath ?? this._resolveBinaryPath()
  }

  // ── Public API ─────────────────────────────────────────

  /** Get the current bridge status */
  get status(): NativeBridgeStatus {
    return { ...this._status }
  }

  /** Start the NativeHelper process and connect via UDS */
  async start(): Promise<void> {
    if (this.isShuttingDown) return

    // Load protobuf schema once
    if (!this.protoLoaded) {
      await loadProtoSchema()
      this.protoLoaded = true
    }

    // Spawn the NativeHelper binary
    this._spawnProcess()

    // Wait for the socket file to appear, then connect
    await this._waitForSocket()
    this._connect()
  }

  /** Gracefully stop the bridge and kill the NativeHelper process */
  async stop(): Promise<void> {
    this.isShuttingDown = true
    this._clearReconnectTimer()

    // Send stop capture before disconnecting
    try {
      await this.stopCapture()
    } catch {
      // Ignore — we're shutting down
    }

    this._disconnect()
    this._killProcess()

    this._status.connected = false
    this._status.processRunning = false
    this._status.captureState = 'idle'
    this._status.micActive = false
    this._status.systemAudioActive = false
  }

  /** Send StartCapture command */
  async startCapture(options: {
    mic: boolean
    system: boolean
  }): Promise<void> {
    this._sendControl({
      startCapture: {
        captureMic: options.mic,
        captureSystem: options.system,
      },
    })
  }

  /** Send StopCapture command */
  async stopCapture(): Promise<void> {
    this._sendControl({ stopCapture: {} })
  }

  /** Send PauseCapture command */
  async pauseCapture(): Promise<void> {
    this._sendControl({ pauseCapture: {} })
  }

  /** Send ResumeCapture command */
  async resumeCapture(): Promise<void> {
    this._sendControl({ resumeCapture: {} })
  }

  /** Send GetStatus command to request a status update */
  async requestStatus(): Promise<void> {
    this._sendControl({ getStatus: {} })
  }

  // ── Process Management ─────────────────────────────────

  private _resolveBinaryPath(): string {
    // In production: binary is bundled in app resources
    const resourcesPath = process.resourcesPath ?? app.getAppPath()
    const prodPath = path.join(resourcesPath, 'native', 'NativeHelper')
    if (existsSync(prodPath)) {
      log.debug(`Found binary (prod): ${prodPath}`)
      return prodPath
    }

    // In development: Swift Package Manager outputs to .build/<triple>/<config>/
    // Try common paths for macOS arm64 and x86_64
    const nativeDir = path.join(__dirname, '..', '..', 'native')
    const triples = ['arm64-apple-macosx', 'x86_64-apple-macosx']
    const configs = ['release', 'debug']

    for (const config of configs) {
      for (const triple of triples) {
        const tripled = path.join(nativeDir, '.build', triple, config, 'NativeHelper')
        if (existsSync(tripled)) {
          log.debug(`Found binary (dev/${config}/${triple}): ${tripled}`)
          return tripled
        }
      }
      // Also check the flat path (older SPM versions)
      const flat = path.join(nativeDir, '.build', config, 'NativeHelper')
      if (existsSync(flat)) {
        log.debug(`Found binary (dev/${config}): ${flat}`)
        return flat
      }
    }

    log.error('NativeHelper binary NOT FOUND in any known path')
    log.error(`Searched: ${nativeDir}/.build/{${triples.join(',')}/{release,debug}`)
    log.error('Build it with: cd desktop && npm run build:native')

    // Last resort: assume it's on PATH (will fail with a clear spawn error)
    return 'NativeHelper'
  }

  /** Kill any leftover NativeHelper processes and remove stale socket */
  private _cleanupStaleProcesses(): void {
    // Kill any existing NativeHelper processes (from previous runs that weren't cleaned up)
    try {
      const result = execSync('pgrep -f NativeHelper', { encoding: 'utf-8', timeout: 3000 }).trim()
      if (result) {
        const pids = result.split('\n').filter(Boolean)
        log.info(`Killing ${pids.length} stale NativeHelper process(es): ${pids.join(', ')}`)
        execSync('pkill -9 -f NativeHelper', { timeout: 3000 })
        // Brief wait for processes to die
        execSync('sleep 0.5', { timeout: 3000 })
      }
    } catch {
      // pgrep returns exit code 1 when no processes found — that's fine
    }

    // Remove stale socket file
    try {
      if (existsSync(this.socketPath)) {
        unlinkSync(this.socketPath)
        log.info(`Removed stale socket: ${this.socketPath}`)
      }
    } catch (err) {
      log.warn(`Could not remove stale socket: ${err}`)
    }
  }

  private _spawnProcess(): void {
    if (this.childProcess) {
      log.debug('Process already running — skipping spawn')
      return
    }

    // Clean up any leftover processes/sockets from previous runs
    this._cleanupStaleProcesses()

    // Ensure socket directory exists (NativeHelper bind fails with ENOENT otherwise)
    try {
      const dir = path.dirname(this.socketPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
        log.debug(`Created socket directory: ${dir}`)
      }
    } catch (err) {
      log.error(`Failed to create socket directory: ${err}`)
      throw err
    }

    log.info(`Spawning NativeHelper: ${this.binaryPath}`)

    try {
      this.childProcess = spawn(this.binaryPath, [
        '--socket-path',
        this.socketPath,
        '--log-level',
        'info',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })

      this._status.processRunning = true

      // Forward stdout/stderr for debugging
      this.childProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().trim()
        if (lines) log.debug(`[NativeHelper] ${lines}`)
      })

      this.childProcess.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().trim()
        if (lines) log.warn(`[NativeHelper:err] ${lines}`)
      })

      this.childProcess.on('exit', (code, signal) => {
        log.info(`NativeHelper exited (code=${code}, signal=${signal})`)
        this.childProcess = null
        this._status.processRunning = false
        this.emit('process-exit', code, signal)

        // Auto-reconnect if not shutting down
        if (!this.isShuttingDown) {
          this._scheduleReconnect()
        }
      })

      this.childProcess.on('error', (err) => {
        log.error('Failed to spawn NativeHelper:', err)
        this.childProcess = null
        this._status.processRunning = false
        this.emit('error', {
          code: 'SPAWN_FAILED',
          message: err.message,
        })
      })
    } catch (err) {
      log.error('Spawn error:', err)
      this._status.processRunning = false
      this.emit('error', {
        code: 'SPAWN_FAILED',
        message: String(err),
      })
    }
  }

  private _killProcess(): void {
    if (!this.childProcess) return

    const pid = this.childProcess.pid
    log.info(`Killing NativeHelper process (pid=${pid})`)
    try {
      // Send SIGTERM for graceful shutdown
      this.childProcess.kill('SIGTERM')

      // Force kill after 1 second if still alive
      const forceKillTimer = setTimeout(() => {
        try {
          if (this.childProcess) {
            log.warn('Force-killing NativeHelper (SIGKILL)')
            this.childProcess.kill('SIGKILL')
          }
          // Also kill by name as a safety net
          execSync('pkill -9 -f NativeHelper', { timeout: 2000 })
        } catch {
          // Already dead
        }
      }, 1000)

      this.childProcess.once('exit', () => {
        clearTimeout(forceKillTimer)
      })
    } catch {
      // Process may already be dead — try pkill as fallback
      try {
        execSync('pkill -9 -f NativeHelper', { timeout: 2000 })
      } catch {
        // Nothing to kill
      }
    }
    this.childProcess = null
    this._status.processRunning = false
  }

  // ── Socket Connection ──────────────────────────────────

  /** Wait for the UDS socket file to appear after spawning */
  private _waitForSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + SOCKET_WAIT_TIMEOUT_MS
      const check = (): void => {
        if (existsSync(this.socketPath)) {
          resolve()
          return
        }
        if (Date.now() > deadline) {
          reject(
            new Error(
              `Socket file did not appear within ${SOCKET_WAIT_TIMEOUT_MS}ms: ${this.socketPath}`,
            ),
          )
          return
        }
        setTimeout(check, SOCKET_POLL_INTERVAL_MS)
      }
      check()
    })
  }

  private _connect(): void {
    if (this.socket) {
      this._disconnect()
    }

    log.info(`Connecting to UDS: ${this.socketPath}`)

    this.socket = net.createConnection({ path: this.socketPath })
    this.readBuffer = Buffer.alloc(0)

    this.socket.on('connect', () => {
      log.success('Connected to NativeHelper')
      this.reconnectAttempts = 0
      this._status.connected = true
      this.emit('connected')
    })

    this.socket.on('data', (chunk: Buffer) => {
      this._onData(chunk)
    })

    this.socket.on('close', () => {
      log.info('Socket closed')
      this._status.connected = false
      this.socket = null

      // Don't emit events during shutdown — the window may already be destroyed
      if (!this.isShuttingDown) {
        this.emit('disconnected')
        this._scheduleReconnect()
      }
    })

    this.socket.on('error', (err) => {
      log.error('Socket error:', err.message)
      // 'close' event will fire after this — reconnect handled there
    })
  }

  private _disconnect(): void {
    if (!this.socket) return
    try {
      this.socket.destroy()
    } catch {
      // Ignore
    }
    this.socket = null
    this._status.connected = false
    this.readBuffer = Buffer.alloc(0)
  }

  // ── Reconnection ───────────────────────────────────────

  private _scheduleReconnect(): void {
    if (this.isShuttingDown) return
    if (this.reconnectTimer) return

    this.reconnectAttempts++
    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      log.error('Max reconnect attempts reached — giving up')
      this.emit('error', {
        code: 'MAX_RECONNECT',
        message: `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`,
      })
      return
    }

    const delay = RECONNECT_DELAY_MS * Math.min(this.reconnectAttempts, 5)
    log.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        // Re-spawn if process died
        if (!this.childProcess) {
          this._spawnProcess()
          await this._waitForSocket()
        }
        this._connect()
      } catch (err) {
        log.error('Reconnect failed:', err)
        this._scheduleReconnect()
      }
    }, delay)
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // ── Data Handling ──────────────────────────────────────

  /** Handle incoming data from the UDS socket */
  private _onData(chunk: Buffer): void {
    // Append to read buffer
    this.readBuffer = Buffer.concat([this.readBuffer, chunk])

    // Parse all complete length-prefixed frames
    const { messages, bytesConsumed } = parseLengthPrefixedFrames(this.readBuffer)

    if (bytesConsumed > 0) {
      this.readBuffer = this.readBuffer.subarray(bytesConsumed)
    }

    // Dispatch each decoded message
    for (const msg of messages) {
      this._dispatchMessage(msg)
    }
  }

  /** Dispatch a decoded NativeMessage to the appropriate event */
  private _dispatchMessage(msg: DecodedNativeMessage): void {
    switch (msg.type) {
      case 'audio-frame': {
        const af = msg.data as AudioFrame
        // Convert raw bytes back to Float32Array.
        // Protobuf Uint8Array may have an unaligned byteOffset, so copy
        // into a fresh ArrayBuffer to guarantee 4-byte alignment.
        const aligned = new ArrayBuffer(af.pcmData.byteLength)
        new Uint8Array(aligned).set(af.pcmData)
        const pcm = new Float32Array(aligned)
        this.emit('audio-frame', {
          source: af.source,
          pcm,
          sampleRate: af.sampleRate,
          timestamp: af.timestampMs,
          numSamples: af.numSamples,
        })
        break
      }

      case 'status': {
        const s = msg.data as StatusUpdate
        this._status.captureState = s.state
        this._status.micActive = s.micActive
        this._status.systemAudioActive = s.systemAudioActive
        this.emit('status', s)
        break
      }

      case 'meeting-event': {
        this.emit('meeting-event', msg.data as MeetingEvent)
        break
      }

      case 'metrics': {
        this.emit('metrics', msg.data as MetricsUpdate)
        break
      }

      case 'error': {
        this.emit('error', msg.data as ErrorEvent)
        break
      }
    }
  }

  // ── Send Control Messages ──────────────────────────────

  private _sendControl(
    cmd: Parameters<typeof encodeControlMessage>[0],
  ): void {
    if (!this.socket || this.socket.destroyed) {
      log.warn('Cannot send — not connected')
      return
    }

    try {
      const frame = encodeControlMessage(cmd)
      this.socket.write(frame)
    } catch (err) {
      log.error('Failed to send control message:', err)
    }
  }
}
