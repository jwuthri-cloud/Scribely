export interface HotkeyConfig {
  toggleOverlay: string
  moveUp: string
  moveDown: string
  moveLeft: string
  moveRight: string
  takeScreenshot: string
  toggleAudio: string
  resetChat: string
  toggleMeeting: string
}

export const DEFAULT_HOTKEYS: HotkeyConfig = {
  toggleOverlay: 'Alt+T',
  moveUp: 'Alt+Up',
  moveDown: 'Alt+Down',
  moveLeft: 'Alt+Left',
  moveRight: 'Alt+Right',
  takeScreenshot: 'Alt+S',
  toggleAudio: 'Alt+A',
  resetChat: 'Alt+R',
  toggleMeeting: 'Alt+M',
}

// ── Transcription Provider Settings ─────────────────────
export type TranscriptionProvider =
  | 'local-fast'     // whisper small.en (~488MB, Metal)
  | 'local-balanced' // whisper medium.en (~1.5GB, Metal)
  | 'local-accurate' // whisper large-v3-turbo (~1.6GB, Metal, multilingual)

export interface TranscriptionSettings {
  provider: TranscriptionProvider
  /** Transcription chunk duration in seconds (1–10). Lower = faster but noisier. */
  chunkDurationSec: number
}

export const DEFAULT_TRANSCRIPTION: TranscriptionSettings = {
  provider: 'local-fast',
  chunkDurationSec: 2,
}

// ── LLM Settings ────────────────────────────────────────
export type ModelId = 'gpt5-nano' | 'gpt5-mini' | 'gpt-5.2'

export interface ModelConfig {
  id: ModelId
  apiModel: string
  contextWindow: number
  maxResponseTokens: number
  label: string
  description: string
}

export const MODEL_CONFIGS: Record<ModelId, ModelConfig> = {
  'gpt5-nano': {
    id: 'gpt5-nano',
    apiModel: 'gpt-5-nano',
    contextWindow: 400000,
    maxResponseTokens: 128000,
    label: 'Nano',
    description: 'Fast, low cost',
  },
  'gpt5-mini': {
    id: 'gpt5-mini',
    apiModel: 'gpt-5-mini',
    contextWindow: 400000,
    maxResponseTokens: 128000,
    label: 'Mini',
    description: 'Balanced',
  },
  'gpt-5.2': {
    id: 'gpt-5.2',
    apiModel: 'gpt-5.2',
    contextWindow: 400000,
    maxResponseTokens: 128000,
    label: '5.2',
    description: 'High intelligence',
  },
}

/** Per-1M-token pricing (USD) for cost display. Cached tokens = 50% of input. */
export const MODEL_PRICING: Record<
  ModelId,
  { inputPer1M: number; outputPer1M: number; cachedPer1M: number }
> = {
  'gpt5-nano': { inputPer1M: 0.05, outputPer1M: 0.4, cachedPer1M: 0.025 },
  'gpt5-mini': { inputPer1M: 0.25, outputPer1M: 2.0, cachedPer1M: 0.125 },
  'gpt-5.2': { inputPer1M: 1.75, outputPer1M: 14.0, cachedPer1M: 0.875 },
}

export function estimateMessageCost(
  usage: { promptTokens: number; completionTokens: number; cachedTokens: number },
  modelId: ModelId,
): number {
  const pricing = MODEL_PRICING[modelId]
  if (!pricing) return 0
  const uncachedInput = usage.promptTokens - usage.cachedTokens
  const inputCost = (uncachedInput / 1_000_000) * pricing.inputPer1M
  const cachedCost = (usage.cachedTokens / 1_000_000) * pricing.cachedPer1M
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.outputPer1M
  return inputCost + cachedCost + outputCost
}

// ── System Prompt ────────────────────────────────────────
export interface SystemPrompt {
  id: string
  name: string
  content: string
  createdAt: number
  updatedAt: number
}

/** Summarization settings for Phase 2 transcript scaling */
export interface SummarizationSettings {
  /** Enable automatic summarization after chat responses */
  autoSummarizeEnabled: boolean
  /** Minutes before summary is considered stale (triggers re-summarization) */
  stalenessMinutes: number
  /** Percent of context budget that triggers summarization (e.g. 40 = 40%) */
  thresholdPercent: number
  /** Number of most recent transcript entries to keep unsummarized */
  keepRawCount: number
  /** Custom system prompt for summarization. Null = use default. */
  summarizerSystemPrompt: string | null
}

export const DEFAULT_SUMMARIZER_SYSTEM_PROMPT = `You are a meeting transcript summarizer. Produce a concise summary that captures:
- Main topics discussed
- Key decisions or conclusions
- Action items or follow-ups mentioned
- Important context for later questions

Keep the summary under 500 words. Use clear paragraphs. Do not include timestamps.`

export const DEFAULT_SUMMARIZATION: SummarizationSettings = {
  autoSummarizeEnabled: true,
  stalenessMinutes: 5,
  thresholdPercent: 40,
  keepRawCount: 5,
  summarizerSystemPrompt: null,
}

export interface LLMSettings {
  apiKey: string
  defaultModel: ModelId
  temperature: number
  /** ID of the active system prompt, or null for no system prompt */
  activeSystemPromptId: string | null
  /** User-created system prompts */
  systemPrompts: SystemPrompt[]
  /** Transcript summarization settings (Phase 2) */
  summarization: SummarizationSettings
}

export const DEFAULT_LLM: LLMSettings = {
  apiKey: '',
  defaultModel: 'gpt5-mini',
  temperature: 0.3,
  activeSystemPromptId: null,
  systemPrompts: [],
  summarization: DEFAULT_SUMMARIZATION,
}

export interface AppSettings {
  themeId: string
  hotkeys: HotkeyConfig
  moveStepPx: number
  windowOpacity: number
  transcription: TranscriptionSettings
  llm: LLMSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'atom-dark',
  hotkeys: { ...DEFAULT_HOTKEYS },
  moveStepPx: 50,
  windowOpacity: 0.85,
  transcription: { ...DEFAULT_TRANSCRIPTION },
  llm: { ...DEFAULT_LLM },
}

export interface ChatAttachment {
  type: 'image'
  data: string // base64 data URL
  label?: string
}

// ── LLM IPC Types ───────────────────────────────────────
export interface LLMChatRequest {
  requestId: string
  /** Formatted content: transcript delta (if any) prepended to the user's question */
  message: string
  /** The user's original question without transcript prefix */
  rawQuery: string
  /** Only the new transcript entries since the last message (for persistence) */
  transcriptDelta: Array<{
    id: string
    speaker: string
    text: string
    startTime: number
    endTime: number
    source: string
  }>
  attachments?: ChatAttachment[]
}

export interface LLMChatDelta {
  requestId: string
  delta: string
  index: number
}

export interface LLMUsage {
  promptTokens: number
  completionTokens: number
  cachedTokens: number
}

export interface LLMChatDone {
  requestId: string
  fullContent: string
  usage: LLMUsage
  model: ModelId
  /** Context window size for utilization display */
  contextWindow?: number
  /** Response latency in milliseconds */
  latencyMs?: number
}

export interface LLMChatError {
  requestId: string
  error: string
  code: 'NETWORK' | 'RATE_LIMIT' | 'CONTEXT_OVERFLOW' | 'API_ERROR' | 'CANCELLED'
  retryable: boolean
}

/** Human-readable labels for each hotkey */
export const HOTKEY_LABELS: Record<keyof HotkeyConfig, string> = {
  toggleOverlay: 'Toggle Overlay',
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  takeScreenshot: 'Take Screenshot',
  toggleAudio: 'Toggle Audio',
  resetChat: 'Reset Chat',
  toggleMeeting: 'Toggle Meeting',
}
