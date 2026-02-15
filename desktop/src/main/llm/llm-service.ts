import OpenAI from 'openai'
import { observeOpenAI } from '@langfuse/openai'
import Store from 'electron-store'
import { BrowserWindow, ipcMain, safeStorage } from 'electron'
import { PromptAssembler } from './prompt-assembler'
import { TokenCounter } from './token-counter'
import { TranscriptMemory } from './transcript-memory'
import { runBackgroundSummarization } from './background-summarizer'

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

const MODEL_PRICING: Record<
  ModelId,
  { inputPer1M: number; outputPer1M: number; cachedPer1M: number }
> = {
  'gpt5-nano': { inputPer1M: 0.05, outputPer1M: 0.4, cachedPer1M: 0.025 },
  'gpt5-mini': { inputPer1M: 0.25, outputPer1M: 2.0, cachedPer1M: 0.125 },
  'gpt-5.2': { inputPer1M: 1.75, outputPer1M: 14.0, cachedPer1M: 0.875 },
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

const DEFAULT_SYSTEM_PROMPT = `You are Scribely, an AI meeting assistant embedded in a desktop overlay.
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
  private transcriptMemory: TranscriptMemory

  // Active request tracking for cancellation
  private activeRequests = new Map<string, AbortController>()

  // Current model (user-switchable, defaults to stored preference or gpt-5.2)
  private currentModel: ModelId = 'gpt-5.2'

  // Session ID for prefix cache routing (one per app session, reset on conversation reset)
  private sessionId: string = crypto.randomUUID()

  // Usage tracking for LLM tab (reset on conversation reset)
  private sessionUsage = {
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
  }

  // Stored prompts per request (last 10) for "show full prompt" feature
  private static readonly MAX_STORED_PROMPTS = 10
  private storedPrompts = new Map<
    string,
    Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  >()

  // Conversation state (in-memory, also persisted to electron-store)
  // In the append-only strategy, each user message's `content` already contains
  // its transcript delta. The conversation array is strictly append-only.
  private conversationMessages: ConversationMessage[] = []

  constructor(store: Store<any>) {
    this.store = store
    this.tokenCounter = new TokenCounter()
    this.transcriptMemory = new TranscriptMemory()
    this.assembler = new PromptAssembler(this.tokenCounter)
    this.migrateSettings()
    this.initClient()

    // Restore persisted model preference
    const llm = this.store.get('llm') as { defaultModel?: ModelId } | undefined
    if (llm?.defaultModel && MODEL_CONFIGS[llm.defaultModel]) {
      this.currentModel = llm.defaultModel
    }
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
      if (!('summarization' in llm)) {
        this.store.set('llm.summarization' as any, {
          autoSummarizeEnabled: true,
          stalenessMinutes: 5,
          thresholdPercent: 40,
          keepRawCount: 25,
          summarizerSystemPrompt: null,
        })
      } else {
        const summ = llm.summarization as Record<string, unknown> | undefined
        if (summ && !('summarizerSystemPrompt' in summ)) {
          this.store.set('llm.summarization.summarizerSystemPrompt' as any, null)
        }
      }
    }
  }

  private getSummarizationConfig(): {
    autoSummarizeEnabled: boolean
    stalenessMinutes: number
    thresholdPercent: number
    keepRawCount: number
    summarizerSystemPrompt: string | null
  } {
    const def = {
      autoSummarizeEnabled: true,
      stalenessMinutes: 5,
      thresholdPercent: 40,
      keepRawCount: 5,
      summarizerSystemPrompt: null as string | null,
    }
    const llm = this.store.get('llm') as { summarization?: typeof def } | undefined
    return { ...def, ...llm?.summarization }
  }

  private initClient(): void {
    const apiKey = this.getDecryptedApiKey()
    if (apiKey) {
      const base = new OpenAI({ apiKey })
      this.client = observeOpenAI(base) as unknown as OpenAI
    }
  }

  /** Decrypt API key from store. Migrates plain-text keys to encrypted on first read. */
  private getDecryptedApiKey(): string | null {
    const llm = this.store.get('llm') as { apiKey?: string; apiKeyEncrypted?: string } | undefined
    const encrypted = llm?.apiKeyEncrypted
    const plain = llm?.apiKey

    if (encrypted && safeStorage.isEncryptionAvailable()) {
      try {
        const buf = Buffer.from(encrypted, 'base64')
        return safeStorage.decryptString(buf)
      } catch {
        return null
      }
    }

    if (plain && plain.trim()) {
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const buf = safeStorage.encryptString(plain)
          this.store.set('llm.apiKeyEncrypted' as any, buf.toString('base64'))
          this.store.delete('llm.apiKey' as any)
        } catch {
          // Keep using plain if encryption fails
        }
      }
      return plain
    }
    return null
  }

  /** Encrypt and store API key. */
  private setEncryptedApiKey(apiKey: string): boolean {
    if (!apiKey.trim()) return false
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buf = safeStorage.encryptString(apiKey)
        this.store.set('llm.apiKeyEncrypted' as any, buf.toString('base64'))
        this.store.delete('llm.apiKey' as any)
        return true
      } catch {
        this.store.set('llm.apiKey' as any, apiKey)
        return true
      }
    }
    this.store.set('llm.apiKey' as any, apiKey)
    return true
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
      this.transcriptMemory.reset()
      this.sessionUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }
      this.storedPrompts.clear()
      this.sessionId = crypto.randomUUID()
    })

    // ── Full prompt (for debugging / transparency) ──
    ipcMain.handle(
      'llm:get-prompt-for-request',
      (_event, requestId: string) => {
        return this.getStoredPrompt(requestId)
      },
    )

    // ── Usage stats (for LLM tab) ──
    ipcMain.handle('llm:get-usage-stats', () => {
      const pricing = this.getModelPricing(this.currentModel)
      const uncached = this.sessionUsage.promptTokens - this.sessionUsage.cachedTokens
      const inputCost = (uncached / 1_000_000) * pricing.inputPer1M
      const cachedCost = (this.sessionUsage.cachedTokens / 1_000_000) * pricing.cachedPer1M
      const outputCost = (this.sessionUsage.completionTokens / 1_000_000) * pricing.outputPer1M
      return {
        ...this.sessionUsage,
        estimatedCostUsd: inputCost + cachedCost + outputCost,
      }
    })

    // ── Model selection ──
    ipcMain.handle('llm:get-model', () => this.currentModel)

    ipcMain.handle('llm:set-model', (_event, modelId: string) => {
      if (MODEL_CONFIGS[modelId as ModelId]) {
        this.currentModel = modelId as ModelId
        this.store.set('llm.defaultModel' as any, modelId)
        return { success: true, model: this.currentModel }
      }
      return { success: false, model: this.currentModel }
    })

    // ── API key (encrypted via safeStorage) ──
    ipcMain.handle('llm:set-api-key', (_event, apiKey: string) => {
      this.setEncryptedApiKey(apiKey)
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

    // ── Summarization ──
    ipcMain.handle(
      'llm:trigger-summarize',
      async (_event, payload?: { transcriptEntries?: TranscriptEntry[] }) => {
        console.log('[llm] Summarization triggered (manual)')
        // Use live transcript from renderer if provided, else from conversation
        const fromPayload = payload?.transcriptEntries ?? []
        const fromConversation = this.conversationMessages.flatMap(
          (m) => m.transcriptDelta ?? [],
        )
        const allEntries =
          fromPayload.length > 0 ? fromPayload : fromConversation

        if (allEntries.length === 0) {
          return {
            success: false,
            error: 'No transcript yet. Start a meeting and wait for transcription.',
          }
        }
        if (!this.client) {
          return { success: false, error: 'API key not configured' }
        }
        if (this.transcriptMemory.isSummarizationInProgress()) {
          return { success: false, error: 'Summarization already in progress' }
        }
        const config = this.getSummarizationConfig()
        const result = await this.runSummarization(
          allEntries,
          config.keepRawCount,
        )
        console.log(
          '[llm] Summarization complete:',
          result.summary ? 'success' : 'failed',
          result.summary ? `(${result.summary.length} chars)` : result.error,
        )
        return {
          success: !!result.summary,
          error: result.summary ? undefined : result.error,
        }
      },
    )

    ipcMain.handle('llm:get-summary', () => {
      return this.transcriptMemory.getSummary()
    })

    ipcMain.handle('llm:get-summarization-status', () => {
      const summary = this.transcriptMemory.getSummary()
      const inProgress = this.transcriptMemory.isSummarizationInProgress()
      const config = this.getSummarizationConfig()
      return {
        hasSummary: !!summary,
        inProgress,
        autoSummarizeEnabled: config.autoSummarizeEnabled,
      }
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
    const transcriptSummary = this.transcriptMemory.getSummary()
    console.log(
      '[llm] Transcript summary:',
      transcriptSummary ? `INCLUDED (${transcriptSummary.length} chars)` : 'MISSING — click "Summarize now" first',
    )
    const assembled = this.assembler.assemble({
      modelConfig,
      systemPrompt,
      conversationMessages: this.conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      transcriptSummary,
    })

    this.storePromptForRequest(request.requestId, assembled.messages)

    const hasSummaryInPrompt = assembled.messages.some(
      (m) => m.role === 'system' && m.content.includes('<transcript_summary>'),
    )
    console.log('[llm] Summary in assembled messages:', hasSummaryInPrompt ? 'YES' : 'NO')
    console.log('[llm] Full prompt:', JSON.stringify(assembled.messages, null, 2))

    // Persist user message to disk
    this.persistConversation()

    // Create abort controller
    const abortController = new AbortController()
    this.activeRequests.set(request.requestId, abortController)

    // gpt-5.2 supports reasoning_effort: 'none' (disables thinking entirely)
    // gpt-5-mini / gpt-5-nano support 'low' at minimum (no 'none')
    const reasoningEffort = this.currentModel === 'gpt-5.2' ? 'none' : 'low'

    const isGpt52 = this.currentModel === 'gpt-5.2'

    const apiMessages = this.buildApiMessagesWithImages(
      assembled.messages,
      request.attachments,
    )

    const requestParams: Record<string, unknown> = {
      model: modelConfig.apiModel,
      messages: apiMessages,
      max_completion_tokens: modelConfig.maxResponseTokens,
      stream: true,
      stream_options: { include_usage: true },
      prompt_cache_key: this.sessionId,
      // prompt_cache_retention is only supported on gpt-5.2
      ...(isGpt52 && { prompt_cache_retention: '24h' }),
      reasoning_effort: reasoningEffort,
    }

    const startTime = Date.now()

    try {
      const stream = await this.client.chat.completions.create(
        requestParams as any,
        { signal: abortController.signal },
      )

      let fullContent = ''
      let chunkIndex = 0
      let usage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }

      for await (const chunk of stream as any) {
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

      this.sendDone(request.requestId, fullContent, usage, startTime)

      // Phase 2: maybe trigger background summarization (async, non-blocking)
      this.maybeTriggerSummarization(modelConfig.contextWindow)
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

  /**
   * Phase 2: Trigger background summarization when transcript volume exceeds
   * threshold and summary is missing or stale. Runs async, does not block.
   */
  private maybeTriggerSummarization(modelBudget: number): void {
    const config = this.getSummarizationConfig()
    if (!config.autoSummarizeEnabled || !this.client) return

    const allEntries = this.conversationMessages.flatMap((m) => m.transcriptDelta ?? [])
    if (allEntries.length === 0) return

    const totalTranscriptTokens = this.tokenCounter.countTranscriptEntries(allEntries)
    const stalenessMs = config.stalenessMinutes * 60 * 1000
    if (
      !this.transcriptMemory.shouldTrigger(totalTranscriptTokens, modelBudget, {
        stalenessMs,
        thresholdPercent: config.thresholdPercent,
      })
    ) {
      return
    }

    console.log(
      '[llm] Summarization triggered (auto) —',
      allEntries.length,
      'entries,',
      totalTranscriptTokens,
      'tokens',
    )
    this.runSummarization(allEntries, config.keepRawCount)
      .then((result) => {
        if (result.summary) {
          this.safeSend('llm:summary-updated', {})
        }
      })
      .catch((err) => {
        console.error('[llm-service] Background summarization error:', err)
      })
  }

  /**
   * Run summarization (used by auto-trigger and manual trigger).
   * Returns { summary, error } — summary is set on success, error on failure.
   */
  private async runSummarization(
    entries: TranscriptEntry[],
    keepRawCount?: number,
  ): Promise<{ summary: string | null; error?: string }> {
    if (!this.client) {
      return { summary: null, error: 'API key not configured' }
    }
    const { summarizerSystemPrompt } = this.getSummarizationConfig()
    return runBackgroundSummarization({
      client: this.client,
      transcriptMemory: this.transcriptMemory,
      entries,
      keepRawCount,
      systemPrompt: summarizerSystemPrompt,
    })
  }

  // ── IPC send helpers ──

  private sendDelta(requestId: string, delta: string, index: number): void {
    this.safeSend('llm:chat-delta', { requestId, delta, index })
  }

  /**
   * Build API messages, converting the last user message to vision format
   * when it has image attachments (screenshots).
   */
  private buildApiMessagesWithImages(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    attachments?: ChatAttachment[],
  ): Array<
    | { role: 'system' | 'user' | 'assistant'; content: string }
    | {
        role: 'user'
        content: Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string } }
        >
      }
  > {
    const images = attachments?.filter((a) => a.type === 'image') ?? []
    if (images.length === 0) return messages

    const result = [...messages]
    const lastUserIdx = result.findLastIndex((m) => m.role === 'user')
    if (lastUserIdx === -1) return messages

    const lastUser = result[lastUserIdx]
    const contentParts: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [{ type: 'text', text: lastUser.content }]
    for (const img of images) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: img.data },
      })
    }
    result[lastUserIdx] = { role: 'user', content: contentParts }
    return result
  }

  private storePromptForRequest(
    requestId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): void {
    this.storedPrompts.set(requestId, messages)
    if (this.storedPrompts.size > LLMService.MAX_STORED_PROMPTS) {
      const oldest = this.storedPrompts.keys().next().value
      if (oldest) this.storedPrompts.delete(oldest)
    }
  }

  private getStoredPrompt(
    requestId: string,
  ): Array<{ role: string; content: string }> | null {
    const messages = this.storedPrompts.get(requestId)
    return messages ? [...messages] : null
  }

  private getModelPricing(modelId: ModelId): {
    inputPer1M: number
    outputPer1M: number
    cachedPer1M: number
  } {
    return MODEL_PRICING[modelId] ?? MODEL_PRICING['gpt-5.2']
  }

  private sendDone(
    requestId: string,
    fullContent: string,
    usage: { promptTokens: number; completionTokens: number; cachedTokens: number },
    requestStartTime: number,
  ): void {
    this.sessionUsage.promptTokens += usage.promptTokens
    this.sessionUsage.completionTokens += usage.completionTokens
    this.sessionUsage.cachedTokens += usage.cachedTokens
    this.safeSend('llm:usage-updated', {})

    if (usage.cachedTokens > 0) {
      const hitRate = Math.round((usage.cachedTokens / usage.promptTokens) * 100)
      console.log(
        `[llm] Cache hit: ${usage.cachedTokens} cached / ${usage.promptTokens} prompt tokens (${hitRate}%)`,
      )
    }
    const modelConfig = MODEL_CONFIGS[this.currentModel]
    const latencyMs = Date.now() - requestStartTime
    this.safeSend('llm:chat-done', {
      requestId,
      fullContent,
      usage,
      model: this.currentModel,
      contextWindow: modelConfig.contextWindow,
      latencyMs,
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
