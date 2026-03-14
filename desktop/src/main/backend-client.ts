import { net } from 'electron'
import { createLogger } from './logger'
import type { AuthService } from './auth/auth-service'

const log = createLogger('backend-client')

export interface MeetingSyncPayload {
  sessionId?: string
  recordingFilepath?: string
  entries: Array<{
    id: string
    speaker: string
    text: string
    startTime: number
    endTime: number
    source: string
  }>
  summary?: {
    totalEntries: number
    speakers: string[]
    durationMs: number
  }
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

  private async request<T>(
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
      const request = net.request({
        method,
        url,
      })

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

  async validateAuth(): Promise<{ authenticated: boolean; userId?: string }> {
    try {
      const result = await this.request<{
        authenticated: boolean
        user?: { id: string }
      }>('GET', '/api/v1/auth/status')
      return {
        authenticated: result.authenticated,
        userId: result.user?.id,
      }
    } catch (err: any) {
      log.error(`Auth validation failed: ${err.message}`)
      return { authenticated: false }
    }
  }

  async syncMeeting(payload: MeetingSyncPayload): Promise<MeetingSyncResult> {
    log.info(
      `Syncing meeting to backend: ${payload.entries.length} entries, ` +
        `session=${payload.sessionId ?? 'none'}`,
    )
    try {
      const result = await this.request<MeetingSyncResult>(
        'POST',
        '/api/v1/meetings/',
        payload,
      )
      log.success(`Meeting synced: ${result.message}`)
      return result
    } catch (err: any) {
      log.error(`Meeting sync failed: ${err.message}`)
      return { success: false, message: err.message }
    }
  }
}
