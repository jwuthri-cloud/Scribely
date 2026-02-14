import type { ChatAttachment, AppSettings, LLMChatRequest, LLMChatDelta, LLMChatDone, LLMChatError, ModelId } from './settings'

/**
 * ElectronAPI exposed via contextBridge in the preload script.
 * Defined here (not imported from preload) to avoid rootDir issues.
 */
export interface ElectronAPI {
  // Visibility
  onToggleVisibility: (callback: (visible: boolean) => void) => () => void

  // Chat
  sendMessage: (message: string) => void
  onMessage: (callback: (response: string) => void) => () => void
  cancelResponse: () => void

  // Settings
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => void
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void

  // Legacy theme
  getThemeId: () => Promise<string>
  setThemeId: (themeId: string) => void

  // Screenshot
  takeScreenshot: () => Promise<string>
  onScreenshotTaken: (callback: (dataUrl: string) => void) => () => void

  // Audio
  onToggleAudio: (callback: () => void) => () => void

  // Meeting / Transcription
  startMeetingSession: () => Promise<{
    sessionId: string
    transcriptionMode: string
    vadEnabled: boolean
  }>
  stopMeetingSession: () => Promise<{ success: boolean }>
  /** Stream a small audio frame to main process for VAD + transcription */
  streamAudioFrame: (payload: {
    source: string
    pcm: ArrayBuffer
    sampleRate: number
    timestamp: number
  }) => void
  /** Legacy: send a chunk directly for transcription (bypasses VAD) */
  transcribeAudioChunk: (payload: {
    source: string
    pcm: ArrayBuffer
    sampleRate: number
    timestamp: number
  }) => Promise<unknown>
  saveMeetingRecording: (payload: {
    data: ArrayBuffer
    mimeType: string
  }) => Promise<{ filepath: string; filename: string }>
  initRecordingFile: (payload: {
    mimeType: string
  }) => Promise<{ filepath: string; filename: string }>
  appendRecordingChunk: (payload: {
    filepath: string
    data: ArrayBuffer
  }) => Promise<void>
  saveTranscript: (payload: {
    entries: Array<{
      id: string
      speaker: string
      text: string
      startTime: number
      endTime: number
      source: string
    }>
    sessionId?: string
    recordingFilepath?: string
  }) => Promise<{ filepath: string; filename: string }>
  getModelStatus: () => Promise<{
    whisperModel: {
      available: boolean
      downloading: boolean
      progress: number
      path?: string
    }
    vadModel: {
      available: boolean
      downloading: boolean
      progress: number
      ready: boolean
    }
  }>
  downloadWhisperModel: () => Promise<{
    success: boolean
    path?: string
    mode?: string
    error?: string
  }>
  onTranscriptEntry: (callback: (entry: any) => void) => () => void
  onMeetingStatusUpdate: (callback: (update: any) => void) => () => void
  onModelProgress: (
    callback: (data: { modelId: string; progress: number }) => void,
  ) => () => void
  onModelComplete: (
    callback: (data: { modelId: string; path: string }) => void,
  ) => () => void

  // Screen Recording (main-process driven)
  startRecording: () => Promise<{ success: boolean; filepath?: string; error?: string }>
  stopRecording: () => Promise<{ filepath: string | null }>
  selectRecordingSource: (sourceId: string) => Promise<void>
  onShowPicker: (
    callback: (data: {
      filepath: string
      sources: Array<{ id: string; name: string; type: 'screen' | 'window'; thumbnailDataUrl: string }>
    }) => void,
  ) => () => void
  onStartCapture: (
    callback: (data: { filepath: string }) => void,
  ) => () => void
  onStopCapture: (callback: () => void) => () => void
  writeRecordingChunk: (payload: { data: Uint8Array }) => Promise<void>

  // Audio Levels (waveform visualization)
  onAudioLevels: (
    callback: (levels: { mic: number; system: number; timestamp: number }) => void,
  ) => () => void

  // Native Capture
  startNativeCapture: (options: {
    mic: boolean
    system: boolean
  }) => Promise<{ success: boolean; error?: string }>
  stopNativeCapture: () => Promise<{ success: boolean; error?: string }>
  getNativeStatus: () => Promise<{
    available: boolean
    connected: boolean
    processRunning: boolean
    captureState: string
    micActive: boolean
    systemAudioActive: boolean
  }>
  onNativeStatusChanged: (
    callback: (status: {
      available: boolean
      connected: boolean
      processRunning: boolean
      captureState: string
      micActive: boolean
      systemAudioActive: boolean
    }) => void,
  ) => () => void
  onNativeError: (callback: (error: { code: string; message: string }) => void) => () => void

  // Chrome Extension Capture
  getExtensionStatus: () => Promise<{ connected: boolean }>
  onExtensionStatusChanged: (
    callback: (status: { connected: boolean }) => void,
  ) => () => void
  onExtensionAutoStartMeeting: (callback: () => void) => () => void
  onExtensionAutoStopMeeting: (callback: () => void) => () => void
  stopExtensionCapture: () => Promise<{ success: boolean }>

  // Meeting toggle
  onToggleMeeting: (callback: () => void) => () => void

  // Reset chat
  onResetChat: (callback: () => void) => () => void

  // LLM
  llmChat: (request: LLMChatRequest) => void
  llmCancel: (requestId: string) => void
  llmReset: () => void
  llmSetModel: (modelId: ModelId) => Promise<{ success: boolean; model: ModelId }>
  llmGetModel: () => Promise<ModelId>
  llmSetApiKey: (apiKey: string) => Promise<{ success: boolean }>
  llmHasApiKey: () => Promise<boolean>
  llmSetTemperature: (temperature: number) => Promise<{ success: boolean }>
  onLLMChatDelta: (callback: (data: LLMChatDelta) => void) => () => void
  onLLMChatDone: (callback: (data: LLMChatDone) => void) => () => void
  onLLMChatError: (callback: (data: LLMChatError) => void) => () => void

  // System Prompts
  llmGetSystemPrompts: () => Promise<import('./settings').SystemPrompt[]>
  llmCreateSystemPrompt: (prompt: { name: string; content: string }) => Promise<import('./settings').SystemPrompt>
  llmUpdateSystemPrompt: (prompt: { id: string; name: string; content: string }) => Promise<import('./settings').SystemPrompt>
  llmDeleteSystemPrompt: (id: string) => Promise<{ success: boolean }>
  llmSetActiveSystemPrompt: (id: string | null) => Promise<{ success: boolean }>
  llmGetActiveSystemPrompt: () => Promise<string | null>

  // Summarization
  llmTriggerSummarize: (payload?: {
    transcriptEntries?: Array<{
      id: string
      speaker: string
      text: string
      startTime: number
      endTime: number
      source: string
    }>
  }) => Promise<{ success: boolean; error?: string }>
  llmGetSummarizationStatus: () => Promise<{
    hasSummary: boolean
    inProgress: boolean
    autoSummarizeEnabled: boolean
  }>
  llmGetSummary: () => Promise<string | null>
  onLLMSummaryUpdated: (callback: () => void) => () => void
  llmGetPromptForRequest: (requestId: string) => Promise<
    Array<{ role: string; content: string }> | null
  >
  llmGetUsageStats: () => Promise<{
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    estimatedCostUsd: number
  }>
  onLLMUsageUpdated: (callback: () => void) => () => void

  // Invisibility
  toggleInvisibility: () => Promise<boolean>
  getInvisibility: () => Promise<boolean>

  // Onboarding
  onboardingGetCompleted: () => Promise<boolean>
  onboardingSetCompleted: (completed: boolean) => Promise<{ success: boolean }>

  // Open external URL
  openExternalUrl: (url: string) => Promise<{ success: boolean }>

  // App lifecycle
  quit: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** User's original question without the transcript prefix (for UI display) */
  rawQuery?: string
  timestamp: number
  attachments?: ChatAttachment[]
  model?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    latencyMs?: number
  }
  isError?: boolean
  retryable?: boolean
}

export type {
  AppSettings,
  HotkeyConfig,
  ChatAttachment,
  TranscriptionProvider,
  TranscriptionSettings,
  SummarizationSettings,
  ModelId,
  ModelConfig,
  LLMSettings,
  SystemPrompt,
  LLMChatRequest,
  LLMChatDelta,
  LLMChatDone,
  LLMChatError,
  LLMUsage,
} from './settings'
export {
  HOTKEY_LABELS,
  DEFAULT_HOTKEYS,
  DEFAULT_SETTINGS,
  DEFAULT_TRANSCRIPTION,
  DEFAULT_LLM,
  DEFAULT_SUMMARIZATION,
  DEFAULT_SUMMARIZER_SYSTEM_PROMPT,
  MODEL_CONFIGS,
  MODEL_PRICING,
  estimateMessageCost,
} from './settings'

// Transcript types
export type {
  TranscriptEntry,
  SpeakerProfile,
  MeetingSession,
  AudioCaptureConfig,
  ModelStatus,
  MeetingStatus,
  AudioSource,
  MeetingMode,
  AudioSourceType,
  WhisperModelStatus,
  VadModelStatus,
} from './transcript'
