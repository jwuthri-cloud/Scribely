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
  focusChatInput: string
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
  focusChatInput: 'Alt+Enter',
}

// ── Transcription Provider Settings ─────────────────────
export type TranscriptionMode = 'local' | 'cloud'

export type LocalModel = 'fast' | 'balanced' | 'accurate'

export type CloudProvider = 'deepgram' | 'assemblyai' | 'gladia' | 'revai'

export type TranscriptionLanguage = 'en' | 'multi'

/** Legacy provider string (for backward compat / derived value) */
export type TranscriptionProvider =
  | 'local-fast'
  | 'local-balanced'
  | 'local-accurate'
  | 'deepgram'
  | 'assemblyai'
  | 'gladia'
  | 'revai'

/** Provider-specific model IDs */
export type DeepgramModel = 'nova-3' | 'nova-2' | 'nova-3-general' | 'nova-3-medical'
export type AssemblyAIModel = 'universal-2' | 'universal-1' | 'universal-3-pro'

export interface TranscriptionSettings {
  mode: TranscriptionMode
  localModel?: LocalModel
  cloudProvider?: CloudProvider
  cloudModel?: string
  language: TranscriptionLanguage
  /** Transcription chunk duration in seconds (1–10). Lower = faster but noisier. */
  chunkDurationSec: number
  apiKeys?: {
    deepgram?: string
    assemblyai?: string
    gladia?: string
    revai?: string
  }
}

export const DEFAULT_TRANSCRIPTION: TranscriptionSettings = {
  mode: 'local',
  localModel: 'fast',
  cloudProvider: 'deepgram',
  cloudModel: 'nova-3',
  language: 'en',
  chunkDurationSec: 2,
  apiKeys: {},
}

/** Derive legacy provider string from new settings (for pipeline/transcriber) */
export function deriveTranscriptionProvider(settings: TranscriptionSettings): TranscriptionProvider {
  if (settings.mode === 'local') {
    const model = settings.localModel ?? 'fast'
    return `local-${model}` as TranscriptionProvider
  }
  return (settings.cloudProvider ?? 'deepgram') as TranscriptionProvider
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

export { DEFAULT_SUMMARIZER_SYSTEM_PROMPT } from '../../../shared/summarizer-defaults'

export const DEFAULT_SUMMARIZATION: SummarizationSettings = {
  autoSummarizeEnabled: true,
  stalenessMinutes: 5,
  thresholdPercent: 40,
  keepRawCount: 5,
  summarizerSystemPrompt: null,
}

/** Custom quick action (label shown on chip, value sent as user message) */
export interface QuickAction {
  label: string
  value: string
  /** Icon id from QUICK_ACTION_ICON_IDS. Optional; falls back to value-based default. */
  icon?: string
}

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { label: 'List action items', value: 'List the action items from this meeting', icon: 'checklist' },
  { label: 'Explain', value: 'Explain this', icon: 'explain' },
  { label: 'Fix code', value: 'Fix this code', icon: 'wrench' },
  { label: 'Rewrite', value: 'Rewrite this', icon: 'pencil' },
]

/** Preset profile for quick configuration */
export type InsightPreset = 'minimal' | 'recommended' | 'power' | 'custom'

/** Speaker filter for insight detection */
export type SpeakerFilter = 'you' | 'them' | 'both'

/** Live Insights settings */
export interface InsightsSettings {
  /** Enable live insights during meetings */
  enabled: boolean
  /** Enable LLM enrichment of detected events */
  enrichmentEnabled: boolean
  /** Per-detector toggles */
  detectQuestions: boolean
  detectTopicChanges: boolean
  detectActionItems: boolean
  detectKeyMentions: boolean
  /** User-added question words (merged with defaults) */
  extraQuestionWords: string[]
  /** User-added question verbs (merged with defaults) */
  extraQuestionVerbs: string[]
  /** Enable ML gate for gray-zone questions (default: true) */
  questionMlEnabled: boolean
  /** Active preset profile */
  insightPreset: InsightPreset
  /** Speaker filter: detect insights from you, them, or both */
  speakerFilter: SpeakerFilter
}

export const INSIGHT_PRESETS: Record<Exclude<InsightPreset, 'custom'>, {
  label: string
  description: string
  config: Omit<InsightsSettings, 'enabled' | 'extraQuestionWords' | 'extraQuestionVerbs' | 'insightPreset'>
}> = {
  minimal: {
    label: 'Minimal',
    description: 'Questions only, no AI. Zero latency, zero cost.',
    config: {
      enrichmentEnabled: false,
      detectQuestions: true,
      detectTopicChanges: false,
      detectActionItems: false,
      detectKeyMentions: false,
      questionMlEnabled: false,
      speakerFilter: 'them',
    },
  },
  recommended: {
    label: 'Recommended',
    description: 'Balanced detection with AI validation. Best for most meetings.',
    config: {
      enrichmentEnabled: true,
      detectQuestions: true,
      detectTopicChanges: true,
      detectActionItems: true,
      detectKeyMentions: false,
      questionMlEnabled: true,
      speakerFilter: 'both',
    },
  },
  power: {
    label: 'Power',
    description: 'Everything on. Full AI enrichment and all detectors.',
    config: {
      enrichmentEnabled: true,
      detectQuestions: true,
      detectTopicChanges: true,
      detectActionItems: true,
      detectKeyMentions: true,
      questionMlEnabled: true,
      speakerFilter: 'both',
    },
  },
}

export const DEFAULT_INSIGHTS: InsightsSettings = {
  enabled: true,
  insightPreset: 'recommended',
  speakerFilter: 'both',
  enrichmentEnabled: true,
  detectQuestions: true,
  detectTopicChanges: true,
  detectActionItems: true,
  detectKeyMentions: false,
  extraQuestionWords: [],
  extraQuestionVerbs: [],
  questionMlEnabled: true,
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
  /** Custom quick actions (max 4). Empty = use defaults. */
  quickActions: QuickAction[]
  /** Live Insights settings */
  insights?: InsightsSettings
}

export const DEFAULT_LLM: LLMSettings = {
  apiKey: '',
  defaultModel: 'gpt5-mini',
  temperature: 0.3,
  activeSystemPromptId: null,
  systemPrompts: [],
  summarization: DEFAULT_SUMMARIZATION,
  quickActions: [],
  insights: DEFAULT_INSIGHTS,
}

export type FontSize = 'small' | 'medium' | 'large'

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

export const FONT_SIZE_VALUES: Record<FontSize, { base: string; sm: string; xs: string; code: string }> = {
  small: { base: '12px', sm: '11px', xs: '10px', code: '11px' },
  medium: { base: '13px', sm: '12px', xs: '10px', code: '12px' },
  large: { base: '15px', sm: '14px', xs: '12px', code: '14px' },
}

export interface AppSettings {
  themeId: string
  hotkeys: HotkeyConfig
  moveStepPx: number
  windowOpacity: number
  fontSize: FontSize
  /** Compact mode: fewer UI elements, no transcript panel, no hotkey hints */
  compactMode?: boolean
  transcription: TranscriptionSettings
  llm: LLMSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'atom-dark',
  hotkeys: { ...DEFAULT_HOTKEYS },
  moveStepPx: 50,
  windowOpacity: 0.85,
  fontSize: 'medium',
  compactMode: false,
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
  focusChatInput: 'Focus Ask Anything',
}
