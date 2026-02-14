import OpenAI from 'openai'
import Store from 'electron-store'
import { BrowserWindow, ipcMain } from 'electron'
import { PromptAssembler } from './prompt-assembler'
import { TokenCounter } from './token-counter'

// ── Types (mirrored from renderer for main process use) ──

type ModelId = 'gpt5-nano' | 'gpt5-mini' | 'gpt-5.2'

interface ModelConfig {
  id: ModelId
  apiModel: string
  contextWindow: number
  maxResponseTokens: number
}

const MODEL_CONFIGS: Record<ModelId, ModelConfig> = {
  'gpt5-nano': {
    id: 'gpt5-nano',
    apiModel: 'gpt-5-nano',
    contextWindow: 8192,
    maxResponseTokens: 2000,
  },
  'gpt5-mini': {
    id: 'gpt5-mini',
    apiModel: 'gpt-5-mini',
    contextWindow: 32768,
    maxResponseTokens: 8000,
  },
  'gpt-5.2': {
    id: 'gpt-5.2',
    apiModel: 'gpt-5.2',
    contextWindow: 131072,
    maxResponseTokens: 32000,
  },
}

interface TranscriptEntry {
  id: string
  speaker: string
  text: string
  startTime: number
  endTime: number
  source: string
}

interface ChatAttachment {
  type: 'image'
  data: string
  label?: string
}

interface LLMChatRequest {
  requestId: string
  /** Formatted content: transcript delta prepended to user's question */
  message: string
  /** User's original question text (without transcript prefix) */
  rawQuery: string
  /** New transcript entries since last message (for persistence) */
  transcriptDelta: TranscriptEntry[]
  attachments?: ChatAttachment[]
}

interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  /** For user messages: includes transcript delta + question. For assistant: the response. */
  content: string
  /** User's original question text (without transcript prefix). Only set for user messages. */
  rawQuery?: string
  /** The transcript entries embedded in this user message. Only set for user messages. */
  transcriptDelta?: TranscriptEntry[]
  timestamp: number
  tokenCount: number
  model?: ModelId
  attachments?: ChatAttachment[]
}

// ── Default system prompt ─────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are AssistMe, an AI meeting assistant embedded in a desktop overlay.
You help users understand, navigate, and act on their meeting conversations in real time.

CAPABILITIES:
- You have access to the live meeting transcript (embedded chronologically in the conversation)
- You can summarize discussions, explain topics, draft follow-ups, and answer questions
- You can see screenshots the user attaches

BEHAVIOR:
- Be concise. The user is in a live meeting and needs quick answers.
- Default to 2-3 sentence responses unless asked for detail.
- When referencing the transcript, cite the speaker name and approximate time.
- If the transcript doesn't contain enough information to answer, say so clearly.
- Format with markdown when helpful (lists, bold for emphasis).`

// ── LLMService ────────────────────────────────────────────

export class LLMService {
  private client: OpenAI | null = null
  private window: BrowserWindow | null = null
  private store: Store<any>
  private assembler: PromptAssembler
  private tokenCounter: TokenCounter

  // Active request tracking for cancellation
  private activeRequests = new Map<string, AbortController>()

  // Current model
  private currentModel: ModelId = 'gpt5-mini'

  // Session ID for prefix cache routing (one per app session, reset on conversation reset)
  private sessionId: string = crypto.randomUUID()

  // Conversation state (in-memory, resets on app restart)
  // In the append-only strategy, each user message's `content` already contains
  // its transcript delta. The conversation array is strictly append-only.
  private conversationMessages: ConversationMessage[] = []

  constructor(store: Store<any>) {
    this.store = store
    this.tokenCounter = new TokenCounter()
    this.assembler = new PromptAssembler(this.tokenCounter)
    this.initClient()
  }

  private initClient(): void {
    const llm = this.store.get('llm') as
      | { apiKey?: string; defaultModel?: ModelId; temperature?: number }
      | undefined
    if (llm?.apiKey) {
      this.client = new OpenAI({ apiKey: llm.apiKey })
    }
    if (llm?.defaultModel) {
      this.currentModel = llm.defaultModel
    }
  }

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  registerIpcHandlers(): void {
    // ── Chat request (streaming) ──
    ipcMain.on('llm:chat', async (_event, request: LLMChatRequest) => {
      await this.handleChat(request)
    })

    // ── Cancel ──
    ipcMain.on('llm:cancel', (_event, requestId: string) => {
      this.cancelRequest(requestId)
    })

    // ── Reset ──
    ipcMain.on('llm:reset', () => {
      this.conversationMessages = []
      // New session ID so cache routing starts fresh
      this.sessionId = crypto.randomUUID()
    })

    // ── Model selection ──
    ipcMain.handle('llm:set-model', (_event, modelId: ModelId) => {
      this.currentModel = modelId
      this.store.set('llm.defaultModel' as any, modelId)
      return { success: true, model: modelId }
    })

    ipcMain.handle('llm:get-model', () => {
      return this.currentModel
    })

    // ── API key ──
    ipcMain.handle('llm:set-api-key', (_event, apiKey: string) => {
      this.store.set('llm.apiKey' as any, apiKey)
      this.initClient()
      return { success: !!this.client }
    })

    ipcMain.handle('llm:has-api-key', () => {
      return !!this.client
    })

    // ── Temperature ──
    ipcMain.handle('llm:set-temperature', (_event, temperature: number) => {
      this.store.set('llm.temperature' as any, temperature)
      return { success: true }
    })
  }

  private async handleChat(request: LLMChatRequest): Promise<void> {
    if (!this.client) {
      this.sendError(
        request.requestId,
        'API key not configured. Open the LLM tab to set your OpenAI key.',
        'API_ERROR',
        false,
      )
      return
    }

    // ── Store user message (content already has transcript delta embedded by useChat) ──
    const userMsg: ConversationMessage = {
      id: request.requestId,
      role: 'user',
      content: request.message,
      rawQuery: request.rawQuery,
      transcriptDelta: request.transcriptDelta,
      timestamp: Date.now(),
      tokenCount: this.tokenCounter.count(request.message),
      attachments: request.attachments,
    }
    this.conversationMessages.push(userMsg)

    // ── Assemble prompt using append-only strategy ──
    // The assembler receives the full conversation history where each user
    // message's content already includes its transcript delta. No separate
    // transcript block needed.
    const modelConfig = MODEL_CONFIGS[this.currentModel]
    const assembled = this.assembler.assemble({
      modelConfig,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      conversationMessages: this.conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    })

    // Create abort controller
    const abortController = new AbortController()
    this.activeRequests.set(request.requestId, abortController)

    const temperature =
      (this.store.get('llm') as { temperature?: number } | undefined)?.temperature ?? 0.3

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: modelConfig.apiModel,
          messages: assembled.messages,
          max_tokens: modelConfig.maxResponseTokens,
          temperature,
          stream: true,
          stream_options: { include_usage: true },
          // ── Prefix cache optimization ──
          // Routes all requests for the same conversation to the same machine,
          // maximizing cache hit probability for the append-only prefix.
          prompt_cache_key: this.sessionId,
          // Extended 24h cache retention for gpt-5.2 (default is ~5-10 min)
          ...(this.currentModel === 'gpt-5.2'
            ? { prompt_cache_retention: '24h' }
            : {}),
        },
        { signal: abortController.signal },
      )

      let fullContent = ''
      let chunkIndex = 0
      let usage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          fullContent += delta
          this.sendDelta(request.requestId, delta, chunkIndex++)
        }

        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            cachedTokens:
              (chunk.usage as any).prompt_tokens_details?.cached_tokens ?? 0,
          }
        }
      }

      // Store assistant message
      const assistantMsg: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
        tokenCount: this.tokenCounter.count(fullContent),
        model: this.currentModel,
      }
      this.conversationMessages.push(assistantMsg)

      this.sendDone(request.requestId, fullContent, usage)
    } catch (err: any) {
      // Remove the user message from conversation on error
      // (so the user can retry without duplicates)
      const userMsgIdx = this.conversationMessages.findIndex(
        (m) => m.id === request.requestId,
      )
      if (userMsgIdx !== -1) {
        this.conversationMessages.splice(userMsgIdx, 1)
      }

      if (err.name === 'AbortError') {
        this.sendError(request.requestId, 'Request cancelled', 'CANCELLED', false)
      } else if (err.status === 429) {
        this.sendError(
          request.requestId,
          'Rate limited. Try again in a moment.',
          'RATE_LIMIT',
          true,
        )
      } else if (err.code === 'context_length_exceeded') {
        this.sendError(
          request.requestId,
          'Context too long. Try resetting chat or switching to a larger model.',
          'CONTEXT_OVERFLOW',
          false,
        )
      } else {
        this.sendError(
          request.requestId,
          err.message || 'Unknown error',
          'API_ERROR',
          true,
        )
      }
    } finally {
      this.activeRequests.delete(request.requestId)
    }
  }

  private cancelRequest(requestId: string): void {
    const controller = this.activeRequests.get(requestId)
    if (controller) {
      controller.abort()
      this.activeRequests.delete(requestId)
    }
  }

  // ── IPC send helpers ──

  private sendDelta(requestId: string, delta: string, index: number): void {
    this.safeSend('llm:chat-delta', { requestId, delta, index })
  }

  private sendDone(
    requestId: string,
    fullContent: string,
    usage: { promptTokens: number; completionTokens: number; cachedTokens: number },
  ): void {
    this.safeSend('llm:chat-done', {
      requestId,
      fullContent,
      usage,
      model: this.currentModel,
    })
  }

  private sendError(
    requestId: string,
    error: string,
    code: string,
    retryable: boolean,
  ): void {
    this.safeSend('llm:chat-error', { requestId, error, code, retryable })
  }

  private safeSend(channel: string, data: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }

  destroy(): void {
    for (const controller of this.activeRequests.values()) {
      controller.abort()
    }
    this.activeRequests.clear()
  }
}
