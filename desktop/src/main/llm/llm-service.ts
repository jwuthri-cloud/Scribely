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
    contextWindow: 400000,
    maxResponseTokens: 128000,
  },
  'gpt5-mini': {
    id: 'gpt5-mini',
    apiModel: 'gpt-5-mini',
    contextWindow: 400000,
    maxResponseTokens: 128000,
  },
  'gpt-5.2': {
    id: 'gpt-5.2',
    apiModel: 'gpt-5.2',
    contextWindow: 400000,
    maxResponseTokens: 128000,
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

interface SystemPrompt {
  id: string
  name: string
  content: string
  createdAt: number
  updatedAt: number
}

interface PersistedConversation {
  sessionId: string
  meetingSessionId: string | null
  messages: ConversationMessage[]
  createdAt: number
  lastMessageAt: number
  systemPromptId: string | null
  model: ModelId
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

  // Locked to gpt-5.2 for reliable streaming
  private readonly currentModel: ModelId = 'gpt-5.2'

  // Session ID for prefix cache routing (one per app session, reset on conversation reset)
  private sessionId: string = crypto.randomUUID()

  // Conversation state (in-memory, also persisted to electron-store)
  // In the append-only strategy, each user message's `content` already contains
  // its transcript delta. The conversation array is strictly append-only.
  private conversationMessages: ConversationMessage[] = []

  constructor(store: Store<any>) {
    this.store = store
    this.tokenCounter = new TokenCounter()
    this.assembler = new PromptAssembler(this.tokenCounter)
    this.migrateSettings()
    this.initClient()
  }

  /** Ensure new LLM settings fields exist in stored config */
  private migrateSettings(): void {
    const llm = this.store.get('llm') as Record<string, unknown> | undefined
    if (llm) {
      if (!('activeSystemPromptId' in llm)) {
        this.store.set('llm.activeSystemPromptId' as any, null)
      }
      if (!('systemPrompts' in llm)) {
        this.store.set('llm.systemPrompts' as any, [])
      }
    }
  }

  private initClient(): void {
    const llm = this.store.get('llm') as { apiKey?: string } | undefined
    if (llm?.apiKey) {
      this.client = new OpenAI({ apiKey: llm.apiKey })
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
    ipcMain.handle('llm:get-model', () => this.currentModel)

    ipcMain.handle('llm:set-model', () => ({ success: true, model: this.currentModel }))

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

    // ── System Prompts ──
    ipcMain.handle('llm:get-system-prompts', () => {
      return this.getSystemPrompts()
    })

    ipcMain.handle(
      'llm:create-system-prompt',
      (_event, data: { name: string; content: string }) => {
        return this.createSystemPrompt(data.name, data.content)
      },
    )

    ipcMain.handle(
      'llm:update-system-prompt',
      (_event, data: { id: string; name: string; content: string }) => {
        return this.updateSystemPrompt(data.id, data.name, data.content)
      },
    )

    ipcMain.handle('llm:delete-system-prompt', (_event, id: string) => {
      return this.deleteSystemPrompt(id)
    })

    ipcMain.handle(
      'llm:set-active-system-prompt',
      (_event, id: string | null) => {
        this.store.set('llm.activeSystemPromptId' as any, id)
        return { success: true }
      },
    )

    ipcMain.handle('llm:get-active-system-prompt', () => {
      return (
        (this.store.get('llm') as { activeSystemPromptId?: string | null } | undefined)
          ?.activeSystemPromptId ?? null
      )
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

    // ── Resolve the active system prompt ──
    const systemPrompt = this.resolveSystemPrompt()

    // ── Assemble prompt using append-only strategy ──
    // The assembler receives the full conversation history where each user
    // message's content already includes its transcript delta. No separate
    // transcript block needed.
    const modelConfig = MODEL_CONFIGS[this.currentModel]
    const assembled = this.assembler.assemble({
      modelConfig,
      systemPrompt,
      conversationMessages: this.conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    })

    // Persist user message to disk
    this.persistConversation()

    // Create abort controller
    const abortController = new AbortController()
    this.activeRequests.set(request.requestId, abortController)

    const requestParams: Record<string, unknown> = {
      model: modelConfig.apiModel,
      messages: assembled.messages,
      max_completion_tokens: modelConfig.maxResponseTokens,
      stream: true,
      stream_options: { include_usage: true },
      prompt_cache_key: this.sessionId,
      prompt_cache_retention: '24h',
      reasoning_effort: 'none',
    }

    try {
      const stream = await this.client.chat.completions.create(
        requestParams as any,
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

      // Persist assistant message to disk
      this.persistConversation()

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

  // ── System Prompt CRUD ──

  /**
   * Resolve the system prompt to use for the current conversation.
   * Returns the active user system prompt, or the default, or null if none selected.
   */
  private resolveSystemPrompt(): string | null {
    const llm = this.store.get('llm') as {
      activeSystemPromptId?: string | null
      systemPrompts?: SystemPrompt[]
    } | undefined

    const activeId = llm?.activeSystemPromptId
    if (!activeId) {
      // No system prompt selected — use default
      return DEFAULT_SYSTEM_PROMPT
    }

    const prompts = llm?.systemPrompts ?? []
    const found = prompts.find((p) => p.id === activeId)
    return found?.content ?? DEFAULT_SYSTEM_PROMPT
  }

  private getSystemPrompts(): SystemPrompt[] {
    const llm = this.store.get('llm') as { systemPrompts?: SystemPrompt[] } | undefined
    return llm?.systemPrompts ?? []
  }

  private createSystemPrompt(name: string, content: string): SystemPrompt {
    const prompt: SystemPrompt = {
      id: crypto.randomUUID(),
      name,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const prompts = this.getSystemPrompts()
    prompts.push(prompt)
    this.store.set('llm.systemPrompts' as any, prompts)
    return prompt
  }

  private updateSystemPrompt(id: string, name: string, content: string): SystemPrompt {
    const prompts = this.getSystemPrompts()
    const idx = prompts.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error(`System prompt not found: ${id}`)

    prompts[idx] = { ...prompts[idx], name, content, updatedAt: Date.now() }
    this.store.set('llm.systemPrompts' as any, prompts)
    return prompts[idx]
  }

  private deleteSystemPrompt(id: string): { success: boolean } {
    const prompts = this.getSystemPrompts()
    const filtered = prompts.filter((p) => p.id !== id)
    this.store.set('llm.systemPrompts' as any, filtered)

    // If the deleted prompt was active, deactivate it
    const llm = this.store.get('llm') as { activeSystemPromptId?: string | null } | undefined
    if (llm?.activeSystemPromptId === id) {
      this.store.set('llm.activeSystemPromptId' as any, null)
    }

    return { success: true }
  }

  // ── Conversation Persistence ──

  private persistConversation(): void {
    try {
      const llm = this.store.get('llm') as { activeSystemPromptId?: string | null } | undefined
      const conversation: PersistedConversation = {
        sessionId: this.sessionId,
        meetingSessionId: null, // TODO: wire to meeting session
        messages: this.conversationMessages,
        createdAt: this.conversationMessages[0]?.timestamp ?? Date.now(),
        lastMessageAt:
          this.conversationMessages[this.conversationMessages.length - 1]?.timestamp ?? Date.now(),
        systemPromptId: llm?.activeSystemPromptId ?? null,
        model: this.currentModel,
      }
      this.store.set(`conversations.${this.sessionId}` as any, conversation)
    } catch (err) {
      console.error('[llm-service] Failed to persist conversation:', err)
    }
  }

  destroy(): void {
    // Persist final conversation state before shutdown
    if (this.conversationMessages.length > 0) {
      this.persistConversation()
    }

    for (const controller of this.activeRequests.values()) {
      controller.abort()
    }
    this.activeRequests.clear()
  }
}
