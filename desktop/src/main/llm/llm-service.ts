import OpenAI from 'openai'
import { machineIdSync } from 'node-machine-id'
import Store from 'electron-store'
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { createLogger } from '../logger'
import { PromptAssembler } from './prompt-assembler'
import {
  type LLMProvider,
  createLLMClient,
  listLocalModels,
  testLocalConnection,
  probeLocalProviders,
  PROVIDER_DEFAULTS,
  DEFAULT_LOCAL_CONTEXT_WINDOW,
  DEFAULT_LOCAL_MAX_RESPONSE_TOKENS,
  type LocalModelInfo,
} from './provider-config'

const log = createLogger('llm-service')
import { TokenCounter } from './token-counter'

/** Overlap in ms before summary end_time — include entries from (end_time - OVERLAP_MS) onward */
const TRANSCRIPT_SUMMARY_OVERLAP_MS = 10_000

/**
 * Parse time string "MM:SS" or "HH:MM:SS" to milliseconds.
 * Returns 0 if parsing fails.
 */
function parseTimeToMs(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0
  const parts = timeStr.trim().split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 2) {
    const [min, sec] = parts
    return min * 60 * 1000 + sec * 1000
  }
  if (parts.length === 3) {
    const [hr, min, sec] = parts
    return hr * 3600 * 1000 + min * 60 * 1000 + sec * 1000
  }
  return 0
}

/**
 * Extract max end_time from transcript summary JSON.
 * Summary may be wrapped in ```json ... ```. Returns 0 if not found.
 */
function getSummaryEndTimeMs(summary: string): number {
  if (!summary?.trim()) return 0
  let jsonStr = summary.trim()
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) jsonStr = fence[1].trim()
  try {
    const data = JSON.parse(jsonStr) as { topics?: Array<{ end_time?: string }> }
    const topics = data?.topics
    if (!Array.isArray(topics) || topics.length === 0) return 0
    let maxMs = 0
    for (const t of topics) {
      const ms = parseTimeToMs(t?.end_time ?? '')
      if (ms > maxMs) maxMs = ms
    }
    return maxMs
  } catch {
    return 0
  }
}

/**
 * When a transcript summary exists, filter transcript delta to only include
 * entries after (summary_end_time - overlap). Rebuild message content with
 * filtered entries.
 */
function filterTranscriptDeltaForSummary(
  summary: string,
  transcriptDelta: TranscriptEntry[],
  rawMessage: string,
  rawQuery: string,
): { content: string; transcriptDelta: TranscriptEntry[] } {
  const endTimeMs = getSummaryEndTimeMs(summary)
  if (endTimeMs <= 0 || transcriptDelta.length === 0) {
    return { content: rawMessage, transcriptDelta }
  }
  const cutoffMs = Math.max(0, endTimeMs - TRANSCRIPT_SUMMARY_OVERLAP_MS)
  const filtered = transcriptDelta.filter((e) => e.startTime >= cutoffMs)
  if (filtered.length === transcriptDelta.length) {
    return { content: rawMessage, transcriptDelta }
  }
  log.info(
    `[llm] Filtered transcript: ${transcriptDelta.length} → ${filtered.length} entries (summary ends at ${endTimeMs}ms, cutoff ${cutoffMs}ms)`,
  )
  const queryBlock = `<user_query>\n${rawQuery}\n</user_query>`
  if (filtered.length === 0) {
    return { content: queryBlock, transcriptDelta: [] }
  }
  const header = 'NEW TRANSCRIPT SINCE LAST MESSAGE:'
  const formatTimestamp = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${String(sec).padStart(2, '0')}`
  }
  const transcriptText = filtered
    .map((e) => `[${formatTimestamp(e.startTime)}] ${e.speaker}: ${e.text}`)
    .join('\n')
  const content = `<transcript>\n${header}\n${transcriptText}\n</transcript>\n\n${queryBlock}`
  return { content, transcriptDelta: filtered }
}
import {
  ANTHROPIC_MODEL_CONFIGS,
  ANTHROPIC_MODEL_PRICING,
  isAnthropicModel,
  streamAnthropicChat,
  type AnthropicModelId,
} from './anthropic-chat'
import { TranscriptMemory } from './transcript-memory'
import { runBackgroundSummarization } from './background-summarizer'
import { runWebSearch, runWebSearchStreaming } from './web-search'
import { runSuggestFollowUp } from './follow-up-suggestions'
import {
  TECH_INTERVIEW_SYSTEM_PROMPT_ID,
  buildTechInterviewSystemPrompt,
} from '../../shared/system-prompt-presets'

// ── Types (mirrored from renderer for main process use) ──

type ModelId =
  | 'gpt-5.6-luna'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-sol'
  | 'gemini-3.5-flash-lite'
  | 'gemini-3.6-flash'

const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash'

export function isGeminiModel(id: string): boolean {
  return id.startsWith('gemini-')
}

interface ModelConfig {
  id: string
  apiModel: string
  contextWindow: number
  maxResponseTokens: number
}

const OPENAI_MODEL_CONFIGS: Record<ModelId, ModelConfig> = {
  'gpt-5.6-luna': {
    id: 'gpt-5.6-luna',
    apiModel: 'gpt-5.6-luna',
    contextWindow: 400_000,
    maxResponseTokens: 128_000,
  },
  'gpt-5.6-terra': {
    id: 'gpt-5.6-terra',
    apiModel: 'gpt-5.6-terra',
    contextWindow: 400_000,
    maxResponseTokens: 128_000,
  },
  'gpt-5.6-sol': {
    id: 'gpt-5.6-sol',
    apiModel: 'gpt-5.6-sol',
    contextWindow: 1_050_000,
    maxResponseTokens: 128_000,
  },
  'gemini-3.5-flash-lite': {
    id: 'gemini-3.5-flash-lite',
    apiModel: 'gemini-3.5-flash-lite',
    contextWindow: 1_000_000,
    maxResponseTokens: 64_000,
  },
  'gemini-3.6-flash': {
    id: 'gemini-3.6-flash',
    apiModel: 'gemini-3.6-flash',
    contextWindow: 1_000_000,
    maxResponseTokens: 64_000,
  },
}

/** Alias for backward compat */
const MODEL_CONFIGS = OPENAI_MODEL_CONFIGS

const MODEL_PRICING: Record<
  ModelId,
  { inputPer1M: number; outputPer1M: number; cachedPer1M: number }
> = {
  'gpt-5.6-luna': { inputPer1M: 1.0, outputPer1M: 6.0, cachedPer1M: 0.1 },
  'gpt-5.6-terra': { inputPer1M: 2.5, outputPer1M: 15.0, cachedPer1M: 0.25 },
  'gpt-5.6-sol': { inputPer1M: 5.0, outputPer1M: 30.0, cachedPer1M: 0.5 },
  'gemini-3.5-flash-lite': { inputPer1M: 0.30, outputPer1M: 2.5, cachedPer1M: 0.03 },
  'gemini-3.6-flash': { inputPer1M: 1.5, outputPer1M: 7.5, cachedPer1M: 0.15 },
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
  model?: string
  attachments?: ChatAttachment[]
}

interface SystemPrompt {
  id: string
  name: string
  content: string
  createdAt: number
  updatedAt: number
}

// ── Default system prompt ─────────────────────────────────

// const DEFAULT_SYSTEM_PROMPT = `You are Scribely, an AI meeting assistant embedded in a desktop overlay.
// You help users understand, navigate, and act on their meeting conversations in real time.

// CAPABILITIES:
// - You have access to the live meeting transcript (embedded chronologically in the conversation)
// - You can summarize discussions, explain topics, draft follow-ups, and answer questions
// - You can see screenshots the user attaches

// BEHAVIOR:
// - Be concise. The user is in a live meeting and needs quick answers.
// - Default to 2-3 sentence responses unless asked for detail.
// - When referencing the transcript, cite the speaker name and approximate time.
// - If the transcript doesn't contain enough information to answer, say so clearly.
// - Format with markdown when helpful (lists, bold for emphasis).`

// Appended to every system prompt (built-in or user-defined) — the renderer needs fenced
// blocks to syntax-highlight code; unfenced code collapses into a single paragraph.
const CODE_FENCE_RULE = '- ALWAYS put code in a fenced block with a language tag (```python … ```), never as prose or bare indented lines. Preserve newlines and indentation.'

const DEFAULT_SYSTEM_PROMPT = `You are Scribely, an AI meeting assistant embedded in a desktop overlay.
You help users understand, navigate, and act on their meeting conversations in real time.

CAPABILITIES:
- You have access to the live meeting transcript (embedded chronologically in the conversation)
- You can summarize discussions, explain topics, draft follow-ups, and answer questions
- You can see screenshots the user attaches

PRIMARY GOAL:
Deliver fast, high-signal responses suitable for live meetings.

RESPONSE STYLE:
- Default to the shortest answer that fully addresses the request.
- Target 1 - 2 short sentences unless the user explicitly asks for more detail.
- Prefer clarity over completeness when time pressure is implied.
- Avoid filler, hedging, repetition, or background explanation unless requested.
- Expand only when the user signals they want deeper detail.

TRANSCRIPT USAGE:
- When referencing transcript content, cite speaker name and approximate time.
- If the transcript lacks enough information, say so clearly and briefly.
- Do not speculate or invent context.

FORMAT:
- Use lightweight markdown only when it improves scan speed or asking for coding help.
- Prioritize readability and quick comprehension.
${CODE_FENCE_RULE}

LANGUAGE:
- Always respond in the same language as the user's query. If the user writes in French, respond in French. If in English, respond in English. Match the language of the transcript when the question references it.

Your responses should feel immediate, focused, and optimized for real-time use.`;

// ── LLMService ────────────────────────────────────────────

const DEFAULT_ANTHROPIC_MODEL: AnthropicModelId = 'claude-sonnet-5'

export class LLMService {
  private client: OpenAI | null = null
  private window: BrowserWindow | null = null
  private store: Store<any>
  private assembler: PromptAssembler
  private tokenCounter: TokenCounter
  private transcriptMemory: TranscriptMemory

  // Active request tracking for cancellation
  private activeRequests = new Map<string, AbortController>()

  // Current model (user-switchable). For OpenAI: gpt-5.6-luna, gpt-5.6-terra, gpt-5.6-sol. For local: model name from API.
  private currentModel: string = 'gpt-5.6-terra'

  // Cached local models (context window, etc.) from Ollama/LM Studio API
  private localModels: LocalModelInfo[] = []

  // Session ID for prefix cache routing (one per app session, reset on conversation reset)
  private sessionId: string = crypto.randomUUID()

  /** When a meeting is active, matches AudioPipeline's meeting session (persisted with conversations). */
  private activeMeetingSessionId: string | null = null

  // Insights validation conversation history (append-only, for prefix caching)
  private insightsValidationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  // Cached device ID for Langfuse userId (stable per machine)
  private deviceUserId: string | null = null

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
    {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      attachmentCount: number
    }
  >()

  // Conversation state (in-memory only — cleared on reset, gone on quit)
  // In the append-only strategy, each user message's `content` already contains
  // its transcript delta. The conversation array is strictly append-only.
  private conversationMessages: ConversationMessage[] = []

  constructor(store: Store<any>) {
    this.store = store
    this.tokenCounter = new TokenCounter()
    this.transcriptMemory = new TranscriptMemory()
    this.assembler = new PromptAssembler(this.tokenCounter)
    this.migrateSettings()
    this.cleanupLegacyConversations()
    // safeStorage is only reliable after app ready, and this constructor runs at
    // module load — initing here reads the encrypted keys as null. See getDecryptedApiKey.
    app.whenReady().then(() => this.initClient())

    // Restore persisted model preference
    const llm = this.store.get('llm') as { defaultModel?: string; provider?: LLMProvider } | undefined
    const provider = this.getProvider()
    if (llm?.defaultModel) {
      const dm = llm.defaultModel
      if (provider === 'anthropic') {
        this.currentModel = isAnthropicModel(dm) ? dm : DEFAULT_ANTHROPIC_MODEL
      } else if (
        (provider === 'openai' || provider === 'gemini') &&
        MODEL_CONFIGS[dm as ModelId]
      ) {
        this.currentModel = dm
      } else if (provider !== 'openai' && provider !== 'gemini') {
        this.currentModel = llm.defaultModel
      }
    }
  }

  /** Get effective model config for prompt assembly and API calls */
  private getEffectiveModelConfig(): ModelConfig {
    const provider = this.getProvider()
    if (provider === 'anthropic') {
      return ANTHROPIC_MODEL_CONFIGS[this.anthropicModelId() ?? DEFAULT_ANTHROPIC_MODEL]
    }
    if (provider === 'openai' || provider === 'gemini') {
      const cfg = MODEL_CONFIGS[this.currentModel as ModelId]
      if (cfg) return cfg
      return MODEL_CONFIGS[provider === 'gemini' ? DEFAULT_GEMINI_MODEL : 'gpt-5.6-terra']
    }
    const local = this.localModels.find((m) => m.id === this.currentModel)
    return {
      id: this.currentModel,
      apiModel: this.currentModel,
      contextWindow: local?.contextWindow ?? DEFAULT_LOCAL_CONTEXT_WINDOW,
      maxResponseTokens: local?.maxResponseTokens ?? DEFAULT_LOCAL_MAX_RESPONSE_TOKENS,
    }
  }

  private isLocalProvider(): boolean {
    const p = this.getProvider()
    return p === 'ollama' || p === 'lmstudio'
  }

  /** Why `this.client` is missing, phrased for the active provider. */
  private noClientMessage(): string {
    switch (this.getProvider()) {
      case 'openai':
        return 'API key not configured. Open the LLM tab to set your OpenAI key.'
      case 'gemini':
        return 'API key not configured. Open the LLM tab to set your Gemini key.'
      default:
        return 'Ollama or LM Studio not running. Start the app and try again.'
    }
  }

  /** OpenAI-only request params (reasoning_effort etc.) must be stripped elsewhere. */
  private stripsOpenAIParams(): boolean {
    return this.getProvider() !== 'openai'
  }

  /** The Claude model to use, or null when the active provider isn't Anthropic. */
  private anthropicModelId(): AnthropicModelId | null {
    if (this.getProvider() !== 'anthropic') return null
    return isAnthropicModel(this.currentModel) ? this.currentModel : DEFAULT_ANTHROPIC_MODEL
  }

  /** Seed built-in "Tech interview" system prompt if not already in the store */
  private ensureTechInterviewSystemPrompt(): void {
    const llm = this.store.get('llm') as { systemPrompts?: SystemPrompt[] } | undefined
    const prompts = llm?.systemPrompts ?? []
    if (prompts.some((p) => p.id === TECH_INTERVIEW_SYSTEM_PROMPT_ID)) return
    const preset = buildTechInterviewSystemPrompt()
    this.store.set('llm.systemPrompts' as any, [...prompts, preset])
  }

  /** Ensure new LLM settings fields exist in stored config */
  private migrateSettings(): void {
    const llm = this.store.get('llm') as Record<string, unknown> | undefined
    if (llm) {
      if (!('provider' in llm)) {
        this.store.set('llm.provider' as any, 'openai')
      }
      if (!('activeSystemPromptId' in llm)) {
        this.store.set('llm.activeSystemPromptId' as any, null)
      }
      if (!('systemPrompts' in llm)) {
        this.store.set('llm.systemPrompts' as any, [])
      }
      this.ensureTechInterviewSystemPrompt()
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

  private getProvider(): LLMProvider {
    const llm = this.store.get('llm') as { provider?: LLMProvider } | undefined
    const p = llm?.provider
    return p === 'anthropic' || p === 'gemini' || p === 'ollama' || p === 'lmstudio'
      ? p
      : 'openai'
  }

  private getLocalBaseUrl(): string {
    const llm = this.store.get('llm') as { localBaseUrl?: string; provider?: LLMProvider } | undefined
    const url = llm?.localBaseUrl?.trim()
    if (url) return url
    const provider = this.getProvider()
    return PROVIDER_DEFAULTS[provider].baseUrl
  }

  /**
   * Decrypted keys, memoized. Every safeStorage read hits the macOS Keychain and
   * blocks the main process; the LLM settings tab asks "do I have a key?" for all
   * three providers on mount and again on every provider click. Cleared on set.
   */
  private keyCache = new Map<'openai' | 'gemini' | 'anthropic', string | null>()

  private getDecryptedApiKey(): string | null {
    return this.cachedKey('openai', () => this.readOpenAIKeyUncached())
  }

  private getGeminiApiKey(): string | null {
    return this.cachedKey('gemini', () => this.readGeminiKeyUncached())
  }

  private getAnthropicApiKey(): string | null {
    return this.cachedKey('anthropic', () => this.readAnthropicKeyUncached())
  }

  private cachedKey(
    which: 'openai' | 'gemini' | 'anthropic',
    read: () => string | null,
  ): string | null {
    const hit = this.keyCache.get(which)
    if (hit !== undefined) return hit
    const value = read()
    this.keyCache.set(which, value)
    return value
  }

  private initClient(): void {
    const provider = this.getProvider()
    if (provider === 'openai' || provider === 'gemini') {
      const apiKey = provider === 'gemini' ? this.getGeminiApiKey() : this.getDecryptedApiKey()
      this.client = createLLMClient(provider, { apiKey }) ?? null
    } else {
      this.client = createLLMClient(provider, {
        baseUrl: this.getLocalBaseUrl(),
        apiKey: null,
      })
    }
  }

  /** Stable device ID for Langfuse userId (enables filtering by user in Langfuse). */
  private getDeviceUserId(): string {
    if (!this.deviceUserId) {
      try {
        this.deviceUserId = machineIdSync()
      } catch {
        this.deviceUserId = `desktop-${crypto.randomUUID()}`
      }
    }
    return this.deviceUserId
  }

  /** Decrypt API key from store. Migrates plain-text keys to encrypted on first read. */
  private readOpenAIKeyUncached(): string | null {
    const llm = this.store.get('llm') as { apiKey?: string; apiKeyEncrypted?: string } | undefined
    const encrypted = llm?.apiKeyEncrypted
    const plain = llm?.apiKey

    if (encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        log.error('OpenAI key: safeStorage unavailable (called before app ready?)')
        return null
      }
      try {
        const buf = Buffer.from(encrypted, 'base64')
        return safeStorage.decryptString(buf)
      } catch (err) {
        log.error('OpenAI key: decrypt failed — re-enter the key', err)
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

  /** Decrypt the Gemini key. Same encrypted-at-rest scheme as the OpenAI key. */
  private readGeminiKeyUncached(): string | null {
    const llm = this.store.get('llm') as
      | { geminiApiKey?: string; geminiApiKeyEncrypted?: string }
      | undefined
    const encrypted = llm?.geminiApiKeyEncrypted
    if (encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        log.error('Gemini key: safeStorage unavailable (called before app ready?)')
        return null
      }
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      } catch (err) {
        log.error('Gemini key: decrypt failed — re-enter the key', err)
        return null
      }
    }
    return llm?.geminiApiKey?.trim() || null
  }

  private setGeminiApiKey(apiKey: string): boolean {
    if (!apiKey.trim()) return false
    this.keyCache.delete('gemini')
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buf = safeStorage.encryptString(apiKey)
        this.store.set('llm.geminiApiKeyEncrypted' as any, buf.toString('base64'))
        this.store.delete('llm.geminiApiKey' as any)
        return true
      } catch {
        // fall through to plain
      }
    }
    this.store.set('llm.geminiApiKey' as any, apiKey)
    return true
  }

  /** Decrypt the Anthropic key. Same encrypted-at-rest scheme as the OpenAI key. */
  private readAnthropicKeyUncached(): string | null {
    const llm = this.store.get('llm') as
      | { anthropicApiKey?: string; anthropicApiKeyEncrypted?: string }
      | undefined
    const encrypted = llm?.anthropicApiKeyEncrypted
    if (encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        log.error('Anthropic key: safeStorage unavailable (called before app ready?)')
        return null
      }
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      } catch (err) {
        log.error('Anthropic key: decrypt failed — re-enter the key', err)
        return null
      }
    }
    return llm?.anthropicApiKey?.trim() || null
  }

  private setAnthropicApiKey(apiKey: string): boolean {
    if (!apiKey.trim()) return false
    this.keyCache.delete('anthropic')
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buf = safeStorage.encryptString(apiKey)
        this.store.set('llm.anthropicApiKeyEncrypted' as any, buf.toString('base64'))
        this.store.delete('llm.anthropicApiKey' as any)
        return true
      } catch {
        // fall through to plain storage
      }
    }
    this.store.set('llm.anthropicApiKey' as any, apiKey)
    return true
  }

  /** Encrypt and store API key. */
  private setEncryptedApiKey(apiKey: string): boolean {
    if (!apiKey.trim()) return false
    this.keyCache.delete('openai')
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

  /** Called when a meeting session starts/stops. */
  setMeetingSessionId(id: string | null): void {
    this.activeMeetingSessionId = id
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
      if (this.isLocalProvider()) {
        return {
          ...this.sessionUsage,
          estimatedCostUsd: 0,
        }
      }
      const pricing = this.getModelPricing(this.currentModel as ModelId)
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
      const provider = this.getProvider()
      if (provider === 'anthropic') {
        if (!isAnthropicModel(modelId)) return { success: false, model: this.currentModel }
        this.currentModel = modelId
        this.store.set('llm.defaultModel' as any, modelId)
        return { success: true, model: this.currentModel }
      }
      if (isAnthropicModel(modelId)) {
        // Claude model picked while a different provider is active — ignore it
        return { success: false, model: this.currentModel }
      }
      if (provider === 'openai' || provider === 'gemini') {
        // Each cloud provider only accepts its own model ids
        const belongs = provider === 'gemini' ? isGeminiModel(modelId) : !isGeminiModel(modelId)
        if (belongs && MODEL_CONFIGS[modelId as ModelId]) {
          this.currentModel = modelId
          this.store.set('llm.defaultModel' as any, modelId)
          return { success: true, model: this.currentModel }
        }
        return { success: false, model: this.currentModel }
      }
      // Local: accept any model (user may have typed manually)
      this.currentModel = modelId
      this.store.set('llm.defaultModel' as any, modelId)
      return { success: true, model: this.currentModel }
    })

    // ── API key (encrypted via safeStorage; only for OpenAI) ──
    ipcMain.handle('llm:set-api-key', (_event, apiKey: string) => {
      // Report whether the key was *stored*. initClient only builds an OpenAI
      // client when OpenAI is the active provider, so `!!this.client` would
      // report failure for a perfectly good key saved while on another provider.
      const ok = this.setEncryptedApiKey(apiKey)
      this.initClient()
      return { success: ok }
    })

    ipcMain.handle('llm:has-api-key', () => !!this.getDecryptedApiKey())

    // ── Anthropic API key (Claude models live alongside the OpenAI ones) ──
    ipcMain.handle('llm:set-anthropic-api-key', (_event, apiKey: string) => {
      const ok = this.setAnthropicApiKey(apiKey)
      return { success: ok }
    })

    ipcMain.handle('llm:has-anthropic-api-key', () => !!this.getAnthropicApiKey())

    // ── Gemini API key (OpenAI-compatible endpoint, own key) ──
    ipcMain.handle('llm:set-gemini-api-key', (_event, apiKey: string) => {
      const ok = this.setGeminiApiKey(apiKey)
      this.initClient()
      return { success: ok }
    })

    ipcMain.handle('llm:has-gemini-api-key', () => !!this.getGeminiApiKey())

    // ── Provider (OpenAI vs Ollama vs LM Studio) ──
    ipcMain.handle('llm:get-provider', () => this.getProvider())

    ipcMain.handle('llm:set-provider', (_event, provider: LLMProvider) => {
      this.store.set('llm.provider' as any, provider)
      this.initClient()
      // Keep the selected model valid for the new provider
      if (provider === 'anthropic' && !isAnthropicModel(this.currentModel)) {
        this.currentModel = DEFAULT_ANTHROPIC_MODEL
        this.store.set('llm.defaultModel' as any, this.currentModel)
      } else if (provider === 'gemini' && !isGeminiModel(this.currentModel)) {
        this.currentModel = DEFAULT_GEMINI_MODEL
        this.store.set('llm.defaultModel' as any, this.currentModel)
      } else if (
        provider === 'openai' &&
        (isAnthropicModel(this.currentModel) || isGeminiModel(this.currentModel))
      ) {
        this.currentModel = 'gpt-5.6-terra'
        this.store.set('llm.defaultModel' as any, this.currentModel)
      }
      return { success: true, provider, model: this.currentModel }
    })

    ipcMain.handle('llm:get-local-base-url', () => this.getLocalBaseUrl())

    ipcMain.handle('llm:set-local-base-url', (_event, baseUrl: string) => {
      this.store.set('llm.localBaseUrl' as any, baseUrl?.trim() || null)
      this.initClient()
      return { success: true }
    })

    // ── Local models (Ollama / LM Studio) ──
    ipcMain.handle('llm:list-local-models', async () => {
      const provider = this.getProvider()
      if (provider !== 'ollama' && provider !== 'lmstudio') {
        return { models: [], error: 'Not a local provider' }
      }
      const result = await listLocalModels(provider, this.getLocalBaseUrl())
      if (result.models.length > 0) {
        this.localModels = result.models
      }
      return result
    })

    ipcMain.handle('llm:test-local-connection', async () => {
      const provider = this.getProvider()
      if (provider !== 'ollama' && provider !== 'lmstudio') {
        return { ok: false, error: 'Not a local provider' }
      }
      return testLocalConnection(provider, this.getLocalBaseUrl())
    })

    // Probe both Ollama and LM Studio (for onboarding wizard)
    ipcMain.handle('llm:probe-local-providers', async () => {
      return probeLocalProviders()
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

    ipcMain.handle('llm:get-built-in-default-system-prompt', () => {
      return DEFAULT_SYSTEM_PROMPT
    })

    // ── Summarization ──
    ipcMain.handle(
      'llm:trigger-summarize',
      async (_event, payload?: { transcriptEntries?: TranscriptEntry[] }) => {
        log.info('[llm] Summarization triggered (manual)')
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
          const msg = this.noClientMessage()
          return { success: false, error: msg }
        }
        if (this.transcriptMemory.isSummarizationInProgress()) {
          return { success: false, error: 'Summarization already in progress' }
        }
        const config = this.getSummarizationConfig()
        const result = await this.runSummarization(
          allEntries,
          config.keepRawCount,
        )
        log.info(
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

    // ── Web search (streaming for chat, non-streaming for Live Insights) ──
    // Web search uses OpenAI Responses API — not available for local providers
    ipcMain.handle(
      'llm:web-search',
      async (_event, query: string) => {
        if (this.getProvider() !== 'openai') {
          return { content: '', error: 'Web search requires OpenAI. Switch to OpenAI in LLM settings.' }
        }
        if (!this.client) {
          return { content: '', error: 'API key not configured' }
        }
        if (!query?.trim()) {
          return { content: '', error: 'Empty query' }
        }
        return runWebSearch(this.client, query.trim())
      },
    )

    ipcMain.handle(
      'llm:suggest-follow-up',
      async (
        _event,
        payload: { prompt: string; transcriptEntries?: Array<{ id: string; speaker: string; text: string; startTime: number; endTime: number; source?: string }> },
      ) => {
        if (!this.client) {
          const msg = this.noClientMessage()
          return { content: '', error: msg }
        }
        const { prompt, transcriptEntries = [] } = payload ?? {}
        if (!prompt?.trim()) {
          return { content: '', error: 'Empty prompt' }
        }
        return runSuggestFollowUp(this.client, prompt.trim(), transcriptEntries, {
          model: this.getEffectiveModelConfig().apiModel,
          stripOpenAIParams: this.stripsOpenAIParams(),
        })
      },
    )

    // Web search streaming (chat only): fire-and-forget, emits delta/done/error
    ipcMain.on(
      'llm:web-search-stream',
      (event, payload: { requestId: string; query: string }) => {
        const { requestId, query } = payload ?? {}
        const sender = event.sender
        const send = (channel: string, data: unknown) => {
          if (!sender.isDestroyed()) sender.send(channel, data)
        }

        if (this.getProvider() !== 'openai') {
          send('llm:web-search-error', {
            requestId,
            error: 'Web search requires OpenAI. Switch to OpenAI in LLM settings.',
          })
          return
        }
        if (!this.client) {
          send('llm:web-search-error', { requestId, error: 'API key not configured' })
          return
        }
        if (!query?.trim()) {
          send('llm:web-search-error', { requestId, error: 'Empty query' })
          return
        }

        runWebSearchStreaming(this.client, query.trim(), {
          onDelta: (delta) => send('llm:web-search-delta', { requestId, delta }),
          onDone: (result) => {
            send('llm:web-search-done', {
              requestId,
              content: result.content,
              sources: result.sources,
            })
            // Add web search exchange to conversation so it's included in the next prompt
            this.addWebSearchToConversation(query.trim(), result.content, result.sources ?? [])
          },
          onError: (error) =>
            send('llm:web-search-error', { requestId, error }),
        })
      },
    )

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
    const anthropicModel = this.anthropicModelId()
    const anthropicKey = anthropicModel ? this.getAnthropicApiKey() : null

    if (anthropicModel ? !anthropicKey : !this.client) {
      const msg = anthropicModel
        ? 'Anthropic API key not configured. Open the LLM tab to set your Claude key.'
        : this.noClientMessage()
      this.sendError(request.requestId, msg, 'API_ERROR', false)
      return
    }

    // ── When we have a transcript summary, filter transcript delta to only include
    //    entries after (summary end_time - 10s overlap). Avoids sending duplicate content. ──
    const transcriptSummary = this.transcriptMemory.getSummary()
    let content = request.message
    let transcriptDelta = request.transcriptDelta
    if (transcriptSummary && transcriptDelta.length > 0) {
      const filtered = filterTranscriptDeltaForSummary(
        transcriptSummary,
        transcriptDelta,
        request.message,
        request.rawQuery,
      )
      content = filtered.content
      transcriptDelta = filtered.transcriptDelta
    }

    // ── Store user message (content already has transcript delta embedded by useChat) ──
    const userMsg: ConversationMessage = {
      id: request.requestId,
      role: 'user',
      content,
      rawQuery: request.rawQuery,
      transcriptDelta,
      timestamp: Date.now(),
      tokenCount: this.tokenCounter.count(content),
      attachments: request.attachments,
    }
    this.conversationMessages.push(userMsg)

    // ── Resolve the active system prompt ──
    const systemPrompt = this.resolveSystemPrompt()

    // ── Assemble prompt using append-only strategy ──
    // The assembler receives the full conversation history where each user
    // message's content already includes its transcript delta. No separate
    // transcript block needed.
    const modelConfig = this.getEffectiveModelConfig()
    log.info(
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

    this.storePromptForRequest(request.requestId, assembled.messages, request.attachments)

    const hasSummaryInPrompt = assembled.messages.some(
      (m) => m.role === 'system' && m.content.includes('<transcript_summary>'),
    )
    log.info('[llm] Summary in assembled messages:', hasSummaryInPrompt ? 'YES' : 'NO')
    log.info('[llm] Full prompt:', JSON.stringify(assembled.messages, null, 2))
    if (request.attachments?.length) {
      const imgCount = request.attachments.filter((a) => a.type === 'image').length
      log.info(`[llm] User message includes ${imgCount} image attachment(s)`)
    }

    // Create abort controller
    const abortController = new AbortController()
    this.activeRequests.set(request.requestId, abortController)

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
    }

    // OpenAI-specific params — omit for local providers, Claude, and Gemini
    // (Gemini's OpenAI-compatible endpoint rejects reasoning_effort / prompt_cache_key)
    if (this.getProvider() === 'openai' && !anthropicModel) {
      const isFlagshipGpt5 = this.currentModel === 'gpt-5.6-sol'
      Object.assign(requestParams, {
        prompt_cache_key: this.sessionId,
        ...(isFlagshipGpt5 && { prompt_cache_retention: '24h' }),
        // 'none' = no thinking pass before the first token; lowest latency
        reasoning_effort: 'none',
      })
    }

    const startTime = Date.now()

    try {
      await (async () => {
          let fullContent = ''
          let chunkIndex = 0
          let usage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }

          if (anthropicModel) {
            const result = await streamAnthropicChat({
              apiKey: anthropicKey!,
              model: anthropicModel,
              messages: apiMessages,
              maxTokens: modelConfig.maxResponseTokens,
              signal: abortController.signal,
              onDelta: (delta) =>
                this.sendDelta(request.requestId, delta, chunkIndex++),
            })
            fullContent = result.fullContent
            usage = result.usage
          } else {
            const stream = await this.client!.chat.completions.create(
              requestParams as any,
              { signal: abortController.signal },
            )

            for await (const chunk of stream as any) {
              const delta = chunk.choices[0]?.delta?.content
              if (delta) {
                fullContent += delta
                this.sendDelta(request.requestId, delta, chunkIndex++)
              }

              if (chunk.usage) {
                const u = chunk.usage as any
                // Support both prompt_tokens_details (Chat) and input_tokens_details (Responses API)
                const cached =
                  u.prompt_tokens_details?.cached_tokens ??
                  u.input_tokens_details?.cached_tokens ??
                  0
                usage = {
                  promptTokens: chunk.usage.prompt_tokens,
                  completionTokens: chunk.usage.completion_tokens,
                  cachedTokens: cached,
                }
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

          this.sendDone(request.requestId, fullContent, usage, startTime)

          // Phase 2: maybe trigger background summarization (async, non-blocking)
          this.maybeTriggerSummarization(modelConfig.contextWindow)
        })()
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

  /**
   * Fit insights conversation history within token budget.
   * Drops oldest user+assistant pairs; prepends truncation note if needed.
   */
  private fitInsightsHistory(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    budget: number,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    if (messages.length === 0) return []
    const totalTokens = this.tokenCounter.countMessages(messages)
    if (totalTokens <= budget) return [...messages]

    const result = [...messages]
    let truncatedPairs = 0

    while (result.length > 1 && this.tokenCounter.countMessages(result) > budget) {
      if (result.length >= 2 && result[0].role === 'user' && result[1].role === 'assistant') {
        result.splice(0, 2)
        truncatedPairs++
      } else if (result[0].role === 'assistant') {
        result.splice(0, 1)
      } else if (result[0].role === 'user' && (result.length < 2 || result[1].role === 'user')) {
        result.splice(0, 1)
        truncatedPairs++
      } else {
        result.splice(0, 1)
      }
    }

    if (truncatedPairs > 0) {
      const firstUserIdx = result.findIndex((m) => m.role === 'user')
      if (firstUserIdx >= 0) {
        const note = `[Earlier conversation messages truncated — ${truncatedPairs} message pair${truncatedPairs > 1 ? 's' : ''} removed]\n\n`
        result[firstUserIdx] = { ...result[firstUserIdx], content: note + result[firstUserIdx].content }
      }
    }

    return result
  }

  /**
   * Generate a short topic label for a transcript segment (last ~5 min).
   * Used by TopicSegmentTracker to provide "previous topic" context for topic-change validation.
   */
  async generateSegmentTopic(
    entries: Array<{ id: string; speaker: string; text: string; startTime: number }>,
  ): Promise<string> {
    if (!this.client || entries.length === 0) return 'N/A'

    const formatEntry = (e: { speaker: string; text: string; startTime: number }) => {
      const min = Math.floor(e.startTime / 60000)
      const sec = Math.floor((e.startTime % 60000) / 1000)
      return `[${min}:${String(sec).padStart(2, '0')}] ${e.speaker}: ${e.text}`
    }
    const transcriptText = entries.map(formatEntry).join('\n')

    const modelConfig = this.getEffectiveModelConfig()
    const baseParams: Record<string, unknown> = {
      model: modelConfig.apiModel,
      messages: [
        {
          role: 'user',
          content: `Given this meeting transcript segment, what is the main topic in 2-5 words? Reply with only the topic, no explanation. Use the same language as the transcript (e.g. French transcript → French topic, English transcript → English topic).\n\n${transcriptText}`,
        },
      ],
      max_completion_tokens: 32,
    }
    if (!this.isLocalProvider()) {
      ;(baseParams as any).reasoning_effort = 'low'
    }
    try {
      const response = await this.client.chat.completions.create(baseParams as any)

      const content = response.choices?.[0]?.message?.content
      return content?.trim() || 'N/A'
    } catch (err) {
      log.error('[llm-service] generateSegmentTopic error:', err)
      return 'N/A'
    }
  }

  /**
   * Unified LLM validation for non-question insights.
   * Maintains conversation history with transcript-delta-only user messages for prefix caching.
   * Returns structured JSON; null fields mean not valid for that modality.
   */
  async validateInsights(
    transcriptDelta: string,
    entry: { id: string; speaker: string; text: string; startTime: number },
    triggeredTypes: string[],
    previousTopic?: string,
  ): Promise<{
    entities: Array<{ type: string; text: string; metadata?: Record<string, unknown> }>
    topic: string
    action_item: string | null
    decision: string | null
    key_mention: string | null
  } | null> {
    if (!this.client || triggeredTypes.length === 0) {
      log.info(`[llm-service] validateInsights skipped: client=${!!this.client}, triggeredTypes=${triggeredTypes.length}`)
      return null
    }

    log.info(`[llm-service] validateInsights called — types: [${triggeredTypes.join(', ')}], speaker: ${entry.speaker}`)

    const systemPrompt = `You are a precision filter for a live meeting assistant. Your job is to REJECT noise, not extract everything. Most utterances should produce all nulls. Only return a value when you are confident it is high-quality and useful to a real user in real time. Respond ONLY with JSON.

Output format:
{
  "entities": [{"type": "person"|"amount"|"date"|"url"|"org"|"place", "text": "...", "metadata": {}}],
  "topic": "short topic label" or "N/A",
  "action_item": "concise action item" or null,
  "decision": "concise decision" or null,
  "key_mention": "useful search phrase (3+ words)" or null
}

Rules:
- entities: extract named entities (person, amount, date, URL, org, place) from the utterance. Low risk — extract what you see.
- topic: "N/A" unless the utterance introduces a new subject worth surfacing. previous_topic (if provided) was the main topic of the last ~5 minutes. Return a short topic label (2-5 words) ONLY when the utterance shifts to a genuinely different topic (e.g. previous "Q3 budget" → new "family update"). Return "N/A" for tangents, clarifications, or same-topic continuation.
- action_item: must have a clear owner or action verb (e.g. "Sarah will send the deck by Friday"). Return null for vague intent: "we should think about it", "maybe we could", "let's see", "we need to figure that out" — these are NOT action items.
- decision: must state a concrete, final choice (e.g. "We'll go with vendor B", "Budget approved at $2M"). Return null for soft agreement: "sounds good", "let's see", "yeah maybe", "I think so" — these are NOT decisions.
- key_mention: must be 3+ words AND useful as a web search query or question. ALWAYS null for: single words ("Cadillac"), bare names ("Alice"), bare numbers ("690"), generic phrases ("next item", "the thing"). Good: "Q3 product launch timeline", "$2.5M marketing budget". If in doubt, null.
- When unsure about ANY field, return null. Precision over recall.
- LANGUAGE: Produce all output (topic, action_item, decision, key_mention) in the same language as the transcript. If the transcript is in French, output in French. If in English, output in English.`

    const typesStr = triggeredTypes.join(', ')
    const previousTopicLine = `Previous segment topic: ${previousTopic ?? 'N/A'}\n\n`
    const transcriptBlock =
      transcriptDelta.trim().length > 0
        ? `${transcriptDelta}\n\n`
        : ''
    const userContent =
      `${previousTopicLine}${transcriptBlock}Candidate utterance (speaker: ${entry.speaker}): "${entry.text}"\n\nTriggered modalities: ${typesStr}`

    this.insightsValidationMessages.push({ role: 'user', content: userContent })

    const INSIGHTS_BUDGET = 100_000
    const fittedHistory = this.fitInsightsHistory(this.insightsValidationMessages.slice(0, -1), INSIGHTS_BUDGET)
    const lastUser = this.insightsValidationMessages[this.insightsValidationMessages.length - 1]!

    const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...fittedHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: lastUser.content },
    ]

    const modelConfig = this.getEffectiveModelConfig()
    const baseParams: Record<string, unknown> = {
      model: modelConfig.apiModel,
      messages: apiMessages,
      max_completion_tokens: 512,
    }
    if (!this.isLocalProvider()) {
      ;(baseParams as any).reasoning_effort = 'low'
      ;(baseParams as any).prompt_cache_key = `insights-${this.sessionId}`
    }
    try {
      const response = await this.client.chat.completions.create(baseParams as any)

      const content = response.choices?.[0]?.message?.content
      if (!content?.trim()) {
        log.info('[llm-service] validateInsights: empty response from LLM')
        return null
      }

      log.info(`[llm-service] validateInsights raw response: ${content.trim().slice(0, 200)}`)
      this.insightsValidationMessages.push({ role: 'assistant', content: content.trim() })

      const jsonStr = content.trim().replace(/^```json?\s*|\s*```$/g, '')
      const parsed = JSON.parse(jsonStr) as {
        entities?: Array<{ type: string; text: string; metadata?: Record<string, unknown> }>
        topic?: string
        action_item?: string | null
        decision?: string | null
        key_mention?: string | null
      }

      const topicRaw = parsed.topic
      const topic = typeof topicRaw === 'string' && topicRaw.trim() ? topicRaw.trim() : 'N/A'

      const rawKeyMention = parsed.key_mention && typeof parsed.key_mention === 'string' ? parsed.key_mention.trim() : null
      const keyMention = rawKeyMention && rawKeyMention.split(/\s+/).length >= 3 ? rawKeyMention : null
      if (rawKeyMention && !keyMention) {
        log.info(`[llm-service] validateInsights: rejected key_mention (under 3 words): "${rawKeyMention}"`)
      }

      return {
        entities: Array.isArray(parsed.entities) ? parsed.entities : [],
        topic,
        action_item: parsed.action_item && typeof parsed.action_item === 'string' ? parsed.action_item.trim() : null,
        decision: parsed.decision && typeof parsed.decision === 'string' ? parsed.decision.trim() : null,
        key_mention: keyMention,
      }
    } catch (err) {
      log.error('[llm-service] validateInsights error:', err)
      this.insightsValidationMessages.pop()
      return null
    }
  }

  /** Clear insights validation history when meeting session ends */
  resetInsightsValidation(): void {
    this.insightsValidationMessages = []
  }

  /**
   * Validate whether a candidate utterance is a genuine question from another person.
   * Uses the configured chat model with last ~500 tokens of transcript context.
   * Returns both the raw question and a self-contained contextual rewrite, or null if not a real question.
   */
  async validateQuestion(
    transcriptContext: string,
    candidateText: string,
    speaker: string,
  ): Promise<{ question: string; questionWithContext: string } | null> {
    if (!this.client) {
      log.info('[llm-service] validateQuestion skipped: no client')
      return null
    }

    log.info(`[llm-service] validateQuestion: speaker=${speaker}, text="${candidateText.slice(0, 60)}"`)

    const systemPrompt = `You are a precision filter for a live meeting assistant. Determine if a GENUINE, substantive question was asked by the other person (not "You"/the user). Most utterances are NOT real questions. Default to "na". Respond ONLY with JSON.

Return {"question": "na"} for ALL of these:
- Rhetorical questions: "you know?", "right?", "isn't it?", "wouldn't you say?"
- Tag questions: "...don't you think?", "...isn't that right?"
- Filler/conversational: "you know what I mean?", "does that make sense?", "how are you?"
- Self-answered questions: speaker asks and immediately answers
- Questions from "You" (the user) — only validate questions from others
- Vague/trivial: "what?", "huh?", "really?", "what about that?"
- Questions that would NOT benefit from an AI answer or web search

ACCEPT (return the question) when:
- Phrase clearly seeks information: "I'm curious, where did he get...", "So what happened to...", "How did they..."
- Incomplete but question intent is clear: "where did he get", "what's the timeline", "how could they"
- Use transcript context to complete if needed for question_with_context

Only if a genuine, substantive question remains, return:
{"question": "<verbatim question from transcript>", "question_with_context": "<contextual rewrite>"}

Rules for question_with_context:
- If the transcript context adds useful specifics (names, topics, dates), rewrite the question to be self-contained. Example: "What's the timeline?" → "What is the timeline for the Q3 product launch?"
- If context does NOT meaningfully change the question, return the EXACT same string as "question". Do NOT add fluff.
- NEVER add parentheticals, meta-commentary, "In the meeting...", "Asking about...", or any explanation. Just the question.
- Preserve the original language of the question. If the candidate is in French, output in French. If in English, output in English.`

    const userContent = `Recent transcript:\n${transcriptContext}\n\nCandidate utterance (speaker: ${speaker}): "${candidateText}"`

    const modelConfig = this.getEffectiveModelConfig()
    const baseParams: Record<string, unknown> = {
      model: modelConfig.apiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: 2048,
    }
    if (!this.isLocalProvider()) {
      ;(baseParams as any).reasoning_effort = 'low'
    }
    try {
      const response = await this.client.chat.completions.create(baseParams as any)

      const content = response.choices?.[0]?.message?.content
      if (!content?.trim()) {
        log.info('[llm-service] validateQuestion: empty response')
        return null
      }

      const jsonStr = content.trim().replace(/^```json?\s*|\s*```$/g, '')
      const parsed = JSON.parse(jsonStr) as { question?: string; question_with_context?: string }
      const q = parsed.question?.trim()
      if (!q || q.toLowerCase() === 'na') {
        log.info('[llm-service] validateQuestion: LLM says "na" — not a real question')
        return null
      }
      const qWithContext = parsed.question_with_context?.trim() || q
      log.info(`[llm-service] validateQuestion: confirmed → "${q.slice(0, 60)}" | context: "${qWithContext.slice(0, 60)}"`)
      return { question: q, questionWithContext: qWithContext }
    } catch (err) {
      log.error('[llm-service] validateQuestion error:', err)
      return null
    }
  }

  /**
   * One-shot completion for Live Insights enrichment.
   * Uses the configured chat model. Returns parsed JSON or null on failure.
   */
  async enrichForInsight(
    eventType: string,
    text: string,
    speaker: string,
  ): Promise<{ title?: string; description?: string; suggestedActions?: Array<{ label: string; type: string; payload: string; icon: string }> } | null> {
    if (!this.client) return null

    const systemPrompt = `You are a precision enricher for a live meeting assistant. Given a detected event, produce a JSON card for the user. If the event is too vague or trivial to enrich meaningfully, respond with: null

Otherwise respond with JSON only (no markdown):
{
  "title": "Short title under 40 chars (e.g. 'Question from Neel', 'Action: send deck')",
  "description": "See rules below — under 100 chars",
  "suggestedActions": [
    { "label": "Answer now", "type": "answer", "payload": "the question or event text", "icon": "sparkle" },
    { "label": "Search the web", "type": "search", "payload": "optimized web search query", "icon": "search" },
    { "label": "Suggest follow-up", "type": "follow_up", "payload": "prompt for follow-up", "icon": "chat" }
  ]
}

Rules for description:
- For questions: the question text VERBATIM. No rewording, no explanation, no "In the meeting..." or "(asking about...)". Just the question.
- For non-questions: one short factual sentence about what happened. No filler, no meta-commentary.

Rules for suggestedActions search payload:
- Write an optimized web search query — not just the raw text. Add context to make it searchable.
  Example: raw text "What's the ROI?" → search payload "ROI calculation methodology business"
- The answer payload should be the question or event text as-is.

LANGUAGE: Produce all output (title, description, suggested action labels and payloads) in the same language as the transcript text. If the text is in French, output in French. If in English, output in English.`

    const userContent = `Event type: ${eventType}\nSpeaker: ${speaker}\nText: "${text}"`

    const modelConfig = this.getEffectiveModelConfig()
    const baseParams: Record<string, unknown> = {
      model: modelConfig.apiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: 512,
    }
    if (!this.isLocalProvider()) {
      ;(baseParams as any).reasoning_effort = 'low'
    }
    try {
      const response = await this.client.chat.completions.create(baseParams as any)

      const content = response.choices?.[0]?.message?.content
      if (!content?.trim()) return null

      const jsonStr = content.trim().replace(/^```json?\s*|\s*```$/g, '')
      if (jsonStr === 'null') {
        log.info('[llm-service] enrichForInsight: LLM returned null — event too trivial')
        return null
      }
      const parsed = JSON.parse(jsonStr) as {
        title?: string
        description?: string
        suggestedActions?: Array<{ label: string; type: string; payload: string; icon: string }>
      } | null
      if (!parsed) return null

      if (parsed.suggestedActions) {
        parsed.suggestedActions = parsed.suggestedActions.map((a) => ({
          ...a,
          id: crypto.randomUUID(),
        }))
      }
      return parsed
    } catch {
      return null
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

    log.info(
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
        log.error('[llm-service] Background summarization error:', err)
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
      const msg = this.noClientMessage()
      return { summary: null, error: msg }
    }
    const { summarizerSystemPrompt } = this.getSummarizationConfig()
    const modelConfig = this.getEffectiveModelConfig()
    return runBackgroundSummarization({
      client: this.client,
      transcriptMemory: this.transcriptMemory,
      entries,
      model: modelConfig.apiModel,
      stripOpenAIParams: this.stripsOpenAIParams(),
      keepRawCount,
      systemPrompt: summarizerSystemPrompt,
      userId: this.getDeviceUserId(),
      sessionId: this.sessionId,
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
    result[lastUserIdx] = { role: 'user', content: contentParts } as unknown as (typeof result)[number]
    return result
  }

  private storePromptForRequest(
    requestId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    attachments?: ChatAttachment[],
  ): void {
    const attachmentCount = attachments?.filter((a) => a.type === 'image').length ?? 0
    this.storedPrompts.set(requestId, { messages, attachmentCount })
    if (this.storedPrompts.size > LLMService.MAX_STORED_PROMPTS) {
      const oldest = this.storedPrompts.keys().next().value
      if (oldest) this.storedPrompts.delete(oldest)
    }
  }

  private getStoredPrompt(
    requestId: string,
  ): { messages: Array<{ role: string; content: string }>; attachmentCount: number } | null {
    const stored = this.storedPrompts.get(requestId)
    if (!stored) return null
    return { messages: [...stored.messages], attachmentCount: stored.attachmentCount }
  }

  private getModelPricing(modelId: string): {
    inputPer1M: number
    outputPer1M: number
    cachedPer1M: number
  } {
    if (isAnthropicModel(modelId)) return ANTHROPIC_MODEL_PRICING[modelId]
    const p = MODEL_PRICING[modelId as ModelId]
    if (p) return p
    return { inputPer1M: 0, outputPer1M: 0, cachedPer1M: 0 }
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
      log.info(
        `[llm] Cache hit: ${usage.cachedTokens} cached / ${usage.promptTokens} prompt tokens (${hitRate}%)`,
      )
    }
    const modelConfig = this.getEffectiveModelConfig()
    const latencyMs = Date.now() - requestStartTime
    // OpenAI prompt caching requires 1024+ tokens; cached_tokens is 0 below that
    if (
      usage.cachedTokens === 0 &&
      usage.promptTokens > 0 &&
      usage.promptTokens < 1024
    ) {
      log.info(
        `[llm] No cache: ${usage.promptTokens} prompt tokens (OpenAI caching needs 1024+)`,
      )
    }

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

  /**
   * Add a web search exchange to the conversation so it's included in the next prompt.
   * Format: user (query) -> assistant (content + sources).
   */
  private addWebSearchToConversation(
    query: string,
    content: string,
    sources: Array<{ title: string; url: string }>,
  ): void {
    const sourcesBlock =
      sources.length > 0
        ? `\n\nSources:\n${sources.map((s) => `- ${s.title}: ${s.url}`).join('\n')}`
        : ''
    const assistantContent = content + sourcesBlock

    const userMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      rawQuery: query,
      timestamp: Date.now(),
      tokenCount: this.tokenCounter.count(query),
    }
    const assistantMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: assistantContent,
      timestamp: Date.now(),
      tokenCount: this.tokenCounter.count(assistantContent),
    }
    this.conversationMessages.push(userMsg, assistantMsg)
  }

  // ── System Prompt CRUD ──

  /**
   * Resolve the system prompt to use for the current conversation.
   * Returns the active user system prompt, or the default, or null if none selected.
   */
  private resolveSystemPrompt(): string | null {
    const llm = this.store.get('llm') as {
      activeSystemPromptId?: string | null
      defaultSystemPromptOverride?: string | null
      systemPrompts?: SystemPrompt[]
    } | undefined

    const activeId = llm?.activeSystemPromptId
    if (!activeId) {
      // No system prompt selected — use default (override or built-in)
      const override = llm?.defaultSystemPromptOverride
      const base = (override && override.trim()) ? override.trim() : DEFAULT_SYSTEM_PROMPT
      return this.withCodeFenceRule(base)
    }

    const prompts = llm?.systemPrompts ?? []
    const found = prompts.find((p) => p.id === activeId)
    return this.withCodeFenceRule(found?.content ?? DEFAULT_SYSTEM_PROMPT)
  }

  /** Custom/stored prompts predate CODE_FENCE_RULE — append it unless already present. */
  private withCodeFenceRule(prompt: string): string {
    return prompt.includes(CODE_FENCE_RULE) ? prompt : `${prompt}\n\n${CODE_FENCE_RULE}`
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

  // ── Conversation cleanup ──

  /**
   * One-time cleanup: conversations used to be persisted into electron-store
   * after every message, with nothing ever reading them back. The blob grew to
   * 118MB inside config.json, and electron-store re-parses that whole file on
   * every store.get() — seconds-long main-thread stalls on each settings read.
   * Conversations are session-scoped and in-memory only now; delete the key.
   */
  private cleanupLegacyConversations(): void {
    try {
      if (this.store.has('conversations' as any)) {
        log.warn('Deleting legacy conversations blob from config.json')
        this.store.delete('conversations' as any)
      }
    } catch (err) {
      log.error('[llm-service] Legacy conversations cleanup failed:', err)
    }
  }

  destroy(): void {
    for (const controller of this.activeRequests.values()) {
      controller.abort()
    }
    this.activeRequests.clear()
  }
}
