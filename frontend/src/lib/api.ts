const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  service: string
  version?: string
  environment?: string
  services?: Record<string, string>
}

export interface APIInfo {
  name: string
  version: string
  description: string
  docs_url: string
  health_url: string
}

export interface ChatRequest {
  message: string
  model?: string
  temperature?: number
}

export interface ChatResponse {
  response: string
  model_used: string
}

class ApiClient {
  private baseUrl: string
  private token?: string | null

  constructor(baseUrl: string = API_BASE_URL, token?: string | null) {
    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.token = token
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    // Add authentication header if token is available
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    const config: RequestInit = {
      headers,
      ...options,
    }

    try {
      const response = await fetch(url, config)

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`

        try {
          const errorData = await response.json()
          errorMessage = errorData.detail || errorData.message || errorMessage
        } catch {
          // If we can't parse the error, use the default message
        }

        throw new Error(errorMessage)
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      } else {
        return response.text() as unknown as T
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('An unexpected error occurred')
    }
  }

  async healthCheck(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/v1/health/')
  }

  async getRoot(): Promise<APIInfo> {
    return this.request<APIInfo>('/')
  }

  async getMetrics(): Promise<Record<string, any>> {
    return this.request<Record<string, any>>('/api/v1/metrics/')
  }

  async chat(message: string, model?: string, temperature?: number): Promise<ChatResponse> {
    return this.request<ChatResponse>('/api/v1/chat/', {
      method: 'POST',
      body: JSON.stringify({
        message,
        model: model || 'openai/gpt-4o-mini',
        temperature: temperature || 0.7,
      }),
    })
  }

  /**
   * Stream chat response using Server-Sent Events
   * @param message - User message
   * @param onChunk - Callback for each content chunk
   * @param onComplete - Callback when stream completes
   * @param onError - Callback for errors
   * @param model - Model to use
   * @param temperature - Temperature for generation
   * @returns AbortController to cancel the stream
   */
  streamChat(
    message: string,
    onChunk: (content: string) => void,
    onComplete: (data: { model: string; totalLength: number }) => void,
    onError: (error: Error) => void,
    model?: string,
    temperature?: number,
  ): AbortController {
    const controller = new AbortController()
    const url = `${this.baseUrl}/api/v1/chat/stream`

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        message,
        model: model || 'openai/gpt-4o-mini',
        temperature: temperature || 0.7,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()

          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Process complete SSE events
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || '' // Keep incomplete event in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.error) {
                  onError(new Error(data.error))
                  return
                }

                if (data.done) {
                  onComplete({
                    model: data.model,
                    totalLength: data.total_length,
                  })
                } else if (data.content) {
                  onChunk(data.content)
                }
              } catch (e) {
                console.warn('Failed to parse SSE event:', line)
              }
            }
          }
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          onError(error)
        }
      })

    return controller
  }
}

// Default unauthenticated client (for public endpoints)
export const apiClient = new ApiClient()

// Factory function to create authenticated API client
export const createApiClient = (token?: string | null): ApiClient => {
  return new ApiClient(API_BASE_URL, token)
}
