const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

type GetTokenFn = () => Promise<string | null>

export interface PaginatedMeetings {
  meetings: MeetingSummary[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface MeetingSummary {
  id: string
  title: string | null
  duration_seconds: number | null
  entry_count: number
  status: string
  recorded_at: string | null
  created_at: string
}

/** GET /api/v1/meetings/{id}/transcript */
export interface EnrichedTranscriptResponse {
  meetingId: string
  hasEnrichedTranscript: boolean
  transcript: Record<string, unknown> | null
}

export interface ProcessingStatusResponse {
  meetingId: string
  status: string
  speakerMap?: Record<string, string> | null
  utteranceCount?: number | null
  error?: string | null
  updatedAt?: string | null
}

export interface UserProfile {
  id: string
  email: string | null
  username: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface ListMeetingsParams {
  page?: number
  limit?: number
  search?: string
  date_from?: string
  date_to?: string
  status?: string
}

export interface MonthlyMeetingCount {
  month: string
  count: number
}

export interface DashboardStats {
  total_meetings: number
  total_duration_seconds: number
  total_transcript_lines: number
  completed_count: number
  processing_count: number
  recent_meetings: MeetingSummary[]
  meetings_per_month: MonthlyMeetingCount[]
}

/** OpenRouter chat model row — matches GET /api/v1/chat/models */
export interface ChatModelOption {
  id: string
  label: string
  description: string
  provider: string
}

export interface ChatModelsResponse {
  models: ChatModelOption[]
  default_model: string
}

/** Public endpoint (no auth) — used to populate the model picker */
export async function fetchChatModels(): Promise<ChatModelsResponse> {
  const res = await fetch(`${API_URL}/api/v1/chat/models`, {
    method: "GET",
    headers: { Accept: "application/json" },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(body || res.statusText || "Failed to load models")
  }
  return res.json()
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export function createApiClient(getToken: GetTokenFn) {
  async function fetchWithAuth(path: string, options?: RequestInit) {
    const token = await getToken()
    if (!token) {
      throw new ApiError(401, "Not authenticated")
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new ApiError(res.status, body || res.statusText)
    }

    return res
  }

  return {
    async getMeetings(params: ListMeetingsParams = {}): Promise<PaginatedMeetings> {
      const qs = new URLSearchParams()
      if (params.page) qs.set("page", String(params.page))
      if (params.limit) qs.set("limit", String(params.limit))
      if (params.search) qs.set("search", params.search)
      if (params.date_from) qs.set("date_from", params.date_from)
      if (params.date_to) qs.set("date_to", params.date_to)
      if (params.status) qs.set("status", params.status)
      const query = qs.toString()
      const res = await fetchWithAuth(`/api/v1/meetings${query ? `?${query}` : ""}`)
      return res.json()
    },

    async getDashboardStats(): Promise<DashboardStats> {
      const res = await fetchWithAuth("/api/v1/meetings/stats")
      return res.json()
    },

    async getMeetingSummary(id: string): Promise<MeetingSummary> {
      const res = await fetchWithAuth(`/api/v1/meetings/${id}`)
      return res.json()
    },

    async getMeeting(id: string): Promise<EnrichedTranscriptResponse> {
      const res = await fetchWithAuth(`/api/v1/meetings/${id}/transcript`)
      return res.json()
    },

    async getMeetingStatus(id: string): Promise<ProcessingStatusResponse> {
      const res = await fetchWithAuth(`/api/v1/meetings/${id}/status`)
      return res.json()
    },

    async getProfile(): Promise<UserProfile> {
      const res = await fetchWithAuth("/api/v1/auth/me")
      return res.json()
    },

    async chatStream(
      message: string,
      onChunk: (text: string) => void,
      options?: { model?: string; temperature?: number }
    ): Promise<void> {
      const token = await getToken()
      if (!token) throw new ApiError(401, "Not authenticated")

      const res = await fetch(`${API_URL}/api/v1/chat/stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          model: options?.model,
          temperature: options?.temperature,
        }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new ApiError(res.status, body || res.statusText)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6).trim()
          if (data === "[DONE]") return

          try {
            const parsed = JSON.parse(data)
            if (parsed.content) {
              onChunk(parsed.content)
            }
            if (parsed.error) {
              throw new Error(parsed.error)
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue
            throw e
          }
        }
      }
    },
  }
}
