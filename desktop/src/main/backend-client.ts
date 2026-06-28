import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { net } from 'electron'
import FormData from 'form-data'
import { createLogger } from './logger'
import type { AuthService } from './auth/auth-service'

const log = createLogger('backend-client')

export interface MeetingSyncPayload {
  sessionId?: string
  /** Synced backend calendar event id (optional) — improves diarization / speaker ID */
  calendarEventId?: string
  /** Absolute path to the local webm recording file (optional) */
  recordingFilepath?: string
  /** Absolute path to the saved transcript JSON file */
  transcriptFilepath: string
}

export interface MeetingSyncResult {
  success: boolean
  message: string
  meetingId?: string
}

export class BackendClient {
  private baseUrl: string | null
  private authService: AuthService

  constructor(authService: AuthService) {
    this.authService = authService
    this.baseUrl = process.env.BACKEND_API_URL || null
    if (this.baseUrl) {
      log.info(`Backend API configured: ${this.baseUrl}`)
    } else {
      log.info('No BACKEND_API_URL configured — backend sync disabled')
    }
  }

  get isConfigured(): boolean {
    return !!this.baseUrl
  }

  private getToken(): string | null {
    return this.authService.getSessionToken()
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('BACKEND_API_URL not configured')
    }

    const token = this.getToken()
    if (!token) {
      throw new Error('No session token available — user not authenticated')
    }

    const url = `${this.baseUrl}${path}`

    return new Promise<T>((resolve, reject) => {
      const request = net.request({ method, url })

      request.setHeader('Authorization', `Bearer ${token}`)
      request.setHeader('Content-Type', 'application/json')
      request.setHeader('Accept', 'application/json')

      let responseBody = ''
      let statusCode = 0

      request.on('response', (response) => {
        statusCode = response.statusCode

        response.on('data', (chunk: Buffer) => {
          responseBody += chunk.toString()
        })

        response.on('end', () => {
          if (statusCode >= 200 && statusCode < 300) {
            try {
              resolve(JSON.parse(responseBody) as T)
            } catch {
              reject(new Error(`Invalid JSON response from ${path}`))
            }
          } else if (statusCode === 401) {
            reject(new Error('Authentication failed (401) — token may be expired'))
          } else {
            reject(new Error(`Backend responded ${statusCode}: ${responseBody.slice(0, 200)}`))
          }
        })

        response.on('error', (err: Error) => {
          reject(new Error(`Response error from ${path}: ${err.message}`))
        })
      })

      request.on('error', (err: Error) => {
        reject(new Error(`Request to ${path} failed: ${err.message}`))
      })

      if (body !== undefined) {
        request.write(JSON.stringify(body))
      }
      request.end()
    })
  }

  /**
   * Upload meeting files (transcript JSON + optional webm recording) to the
   * backend as a multipart/form-data request.
   */
  private async requestMultipart<T>(
    method: string,
    path: string,
    form: FormData,
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('BACKEND_API_URL not configured')
    }

    const token = this.getToken()
    if (!token) {
      throw new Error('No session token available — user not authenticated')
    }

    const url = `${this.baseUrl}${path}`
    const formHeaders = form.getHeaders()

    return new Promise<T>((resolve, reject) => {
      const request = net.request({ method, url })

      request.setHeader('Authorization', `Bearer ${token}`)
      request.setHeader('Accept', 'application/json')
      // Set Content-Type including the boundary from form-data
      request.setHeader('Content-Type', formHeaders['content-type'])

      let responseBody = ''
      let statusCode = 0

      request.on('response', (response) => {
        statusCode = response.statusCode

        response.on('data', (chunk: Buffer) => {
          responseBody += chunk.toString()
        })

        response.on('end', () => {
          if (statusCode >= 200 && statusCode < 300) {
            try {
              resolve(JSON.parse(responseBody) as T)
            } catch {
              reject(new Error(`Invalid JSON response from ${path}`))
            }
          } else if (statusCode === 401) {
            reject(new Error('Authentication failed (401) — token may be expired'))
          } else if (statusCode === 413) {
            reject(new Error(`File too large: ${responseBody.slice(0, 200)}`))
          } else {
            reject(new Error(`Backend responded ${statusCode}: ${responseBody.slice(0, 200)}`))
          }
        })

        response.on('error', (err: Error) => {
          reject(new Error(`Response error from ${path}: ${err.message}`))
        })
      })

      request.on('error', (err: Error) => {
        reject(new Error(`Request to ${path} failed: ${err.message}`))
      })

      // Pipe the form data into the request
      const buffer = form.getBuffer()
      request.write(buffer)
      request.end()
    })
  }

  async validateAuth(): Promise<{ authenticated: boolean; userId?: string; useRecallSdk: boolean }> {
    try {
      const result = await this.requestJson<{
        authenticated: boolean
        user?: { id: string; use_recall_sdk?: boolean }
      }>('GET', '/api/v1/auth/status')
      return {
        authenticated: result.authenticated,
        userId: result.user?.id,
        useRecallSdk: !!result.user?.use_recall_sdk,
      }
    } catch (err: any) {
      log.error(`Auth validation failed: ${err.message}`)
      return { authenticated: false, useRecallSdk: false }
    }
  }

  /**
   * Mint a per-recording Recall Desktop SDK upload token. The raw Recall API key
   * never reaches the desktop — the backend holds it and returns only this token.
   * 403 if the user isn't entitled. `recordingConfig` (transcript provider +
   * realtime_endpoints) is optional and passed through to Recall at mint time.
   */
  async getRecallUploadToken(recordingConfig?: unknown): Promise<{ id: string; uploadToken: string }> {
    const res = await this.requestJson<{ id: string; upload_token: string }>(
      'POST',
      '/api/v1/recall/upload-token',
      recordingConfig !== undefined ? { recording_config: recordingConfig } : {},
    )
    return { id: res.id, uploadToken: res.upload_token }
  }

  async syncMeeting(payload: MeetingSyncPayload): Promise<MeetingSyncResult> {
    log.info(
      `Syncing meeting to backend: transcriptFilepath=${payload.transcriptFilepath}, ` +
        `recordingFilepath=${payload.recordingFilepath ?? 'none'}, ` +
        `session=${payload.sessionId ?? 'none'}`,
    )

    try {
      const form = new FormData()

      // Always upload the transcript JSON
      if (!existsSync(payload.transcriptFilepath)) {
        throw new Error(`Transcript file not found: ${payload.transcriptFilepath}`)
      }
      const transcriptData = await readFile(payload.transcriptFilepath)
      form.append('transcript', transcriptData, {
        filename: 'transcript.json',
        contentType: 'application/json',
      })

      // Optionally upload the recording webm
      if (payload.recordingFilepath && existsSync(payload.recordingFilepath)) {
        const videoData = await readFile(payload.recordingFilepath)
        form.append('video', videoData, {
          filename: 'recording.webm',
          contentType: 'video/webm',
        })
        log.info(`Attaching recording: ${(videoData.byteLength / (1024 * 1024)).toFixed(1)}MB`)
      }

      // Add optional session ID as a form field
      if (payload.sessionId) {
        form.append('sessionId', payload.sessionId)
      }
      if (payload.calendarEventId) {
        form.append('calendarEventId', payload.calendarEventId)
      }

      const result = await this.requestMultipart<MeetingSyncResult>(
        'POST',
        '/api/v1/meetings/',
        form,
      )
      log.success(`Meeting synced: ${result.message} (id=${result.meetingId})`)
      return result
    } catch (err: any) {
      log.error(`Meeting sync failed: ${err.message}`)
      return { success: false, message: err.message }
    }
  }
}
