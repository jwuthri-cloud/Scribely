import type { ChatAttachment, AppSettings, LLMChatRequest, LLMChatDelta, LLMChatDone, LLMChatError, ModelId } from './settings'

export type UploadStatus = 'pending' | 'uploading' | 'success' | 'failed'

export interface UploadQueueItem {
  id: string
  transcriptFilepath: string
  recordingFilepath?: string
  sessionId?: string
  calendarEventId?: string
  createdAt: number
  status: UploadStatus
  error?: string
  attemptCount: number
  lastAttemptAt?: number
  meetingId?: string
  displayName: string
  hasRecording: boolean
}

export interface AuthUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  imageUrl: string | null
}

export interface AuthState {
  mode: 'guest' | 'authenticated'
  user: AuthUser | null
}

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

  // Auth
  authStartSignIn: () => Promise<{ success: boolean; error?: string }>
  authSkip: () => Promise<void>
  authGetState: () => Promise<AuthState>
  authSignOut: () => Promise<void>
  authGetUserProfile: () => Promise<AuthUser | null>
  onAuthStateChanged: (callback: (state: AuthState) => void) => () => void
  onAuthTokenExpired: (callback: () => void) => () => void

  // Backend Sync
  backendSyncMeeting: (payload: {
    /** Absolute path to the saved transcript JSON file (required) */
    transcriptFilepath: string
    /** Absolute path to the webm recording file (optional) */
    recordingFilepath?: string
    /** Meeting session ID (optional) */
    sessionId?: string
    /** Synced calendar event id for participant-based diarization hints (optional) */
    calendarEventId?: string
  }) => Promise<{ success: boolean; message: string; meetingId?: string }>

  backendValidateAuth: () => Promise<{ authenticated: boolean; userId?: string }>

  // Upload Queue
  uploadQueueGetHistory: () => Promise<UploadQueueItem[]>
  uploadQueueRetryItem: (id: string) => Promise<void>
  uploadQueueClearItem: (id: string) => Promise<void>
  uploadQueueClearAll: () => Promise<void>
  onUploadQueueChanged: (callback: (items: UploadQueueItem[]) => void) => () => void

  // Settings
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => void
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void

  // App updates (electron-updater)
  updaterGetStatus: () => Promise<{
    currentVersion: string
    pendingVersion: string | null
    updatesEnabled: boolean
  }>
  updaterCheck: () => Promise<{ ok: boolean; error?: string }>
  updaterQuitAndInstall: () => Promise<void>
  onUpdaterChecking: (callback: () => void) => () => void
  onUpdaterUpdateAvailable: (callback: (info: { version: string }) => void) => () => void
  onUpdaterUpdateNotAvailable: (callback: () => void) => () => void
  onUpdaterError: (callback: (data: { message: string }) => void) => () => void
  onUpdaterDownloadProgress: (
    callback: (data: { percent: number; transferred: number; total: number }) => void,
  ) => () => void
  onUpdaterUpdateDownloaded: (callback: (data: { version: string }) => void) => () => void

  // Legacy theme
  getThemeId: () => Promise<string>
  setThemeId: (themeId: string) => void

  // Screenshot
  takeScreenshot: () => Promise<string>
  onScreenshotTaken: (callback: (dataUrl: string) => void) => () => void
  checkScreenRecordingPermission: () => Promise<boolean>
  checkAccessibilityPermission: () => Promise<boolean>

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
  /** Exclude user's mic from transcript and recording (others only) */
  setExcludeMyMic: (value: boolean) => void
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
    provider?: string
    recallUploadId?: string
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
  cancelRecording: () => Promise<void>
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
  stopExtensionCapture: () => Promise<{ success: boolean; filepath?: string }>

  // ── Recall SDK (alternative capture backend) ───
  onRecallAutoStartMeeting: (callback: (data: { uploadId?: string }) => void) => () => void
  onRecallAutoStopMeeting: (callback: () => void) => () => void
  stopRecallMeeting: () => Promise<{ success: boolean }>
  getRecallStatus: () => Promise<{ provider: 'recall' | 'base'; entitled: boolean }>

  // Meeting toggle
  onToggleMeeting: (callback: () => void) => () => void

  // Reset chat
  onResetChat: (callback: () => void) => () => void

  // Focus chat input
  onFocusChatInput?: (callback: () => void) => () => void

  // LLM
  llmChat: (request: LLMChatRequest) => void
  llmCancel: (requestId: string) => void
  llmReset: () => void
  llmSetModel: (modelId: string) => Promise<{ success: boolean; model: string }>
  llmGetModel: () => Promise<string>
  llmSetApiKey: (apiKey: string) => Promise<{ success: boolean }>
  llmHasApiKey: () => Promise<boolean>
  llmGetProvider: () => Promise<string>
  llmSetProvider: (provider: 'openai' | 'ollama' | 'lmstudio') => Promise<{ success: boolean; provider: string }>
  llmGetLocalBaseUrl: () => Promise<string>
  llmSetLocalBaseUrl: (baseUrl: string) => Promise<{ success: boolean }>
  llmListLocalModels: () => Promise<{ models: import('./settings').LocalModelInfo[]; error?: string }>
  llmTestLocalConnection: () => Promise<{ ok: boolean; error?: string }>
  llmProbeLocalProviders: () => Promise<{
    ollama: { ok: boolean; models: import('./settings').LocalModelInfo[]; error?: string }
    lmstudio: { ok: boolean; models: import('./settings').LocalModelInfo[]; error?: string }
  }>
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
  llmGetBuiltInDefaultSystemPrompt: () => Promise<string>

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
    { messages: Array<{ role: string; content: string }>; attachmentCount: number } | null
  >
  llmGetUsageStats: () => Promise<{
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    estimatedCostUsd: number
  }>
  onLLMUsageUpdated: (callback: () => void) => () => void

  // Live Insights
  onInsightNew: (callback: (insight: import('./insights').Insight) => void) => () => void
  onInsightUpdate: (
    callback: (update: {
      id: string
      title?: string
      description?: string
      suggestedActions?: import('./insights').InsightAction[]
    }) => void,
  ) => () => void
  llmWebSearch: (query: string) => Promise<import('./insights').WebSearchResult>
  llmSuggestFollowUp: (payload: { prompt: string; transcriptEntries?: Array<{ id: string; speaker: string; text: string; startTime: number; endTime: number; source?: string }> }) => Promise<{ content: string; error?: string }>
  llmWebSearchStream: (payload: { requestId: string; query: string }) => void
  onLLMWebSearchDelta: (callback: (data: { requestId: string; delta: string }) => void) => () => void
  onLLMWebSearchDone: (
    callback: (data: {
      requestId: string
      content: string
      sources?: Array<{ title: string; url: string }>
    }) => void,
  ) => () => void
  onLLMWebSearchError: (callback: (data: { requestId: string; error: string }) => void) => () => void
  sendToChat: (text: string) => void
  onChatMessageFromInsights: (callback: (text: string) => void) => () => void

  // Invisibility
  toggleInvisibility: () => Promise<boolean>
  getInvisibility: () => Promise<boolean>

  // Window hide/show
  toggleWindowVisibility: () => Promise<void>

  // Onboarding
  onboardingGetCompleted: () => Promise<boolean>
  onboardingSetCompleted: (completed: boolean) => Promise<{ success: boolean }>

  // Open external URL
  clipboardWriteText: (text: string) => Promise<void>
  openExternalUrl: (url: string) => Promise<{ success: boolean }>

  // Window resize
  setWindowSize: (size: { width: number; height: number }) => void

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
  /** True when this assistant message is from a web search (vs regular chat) */
  isWebSearch?: boolean
  /** Sources from web search (when message is a web search result) */
  webSources?: Array<{ title: string; url: string }>
  model?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    latencyMs?: number
  }
  isError?: boolean
  retryable?: boolean
  /** True when this assistant message is a follow-up questions response (list items are clickable) */
  isFollowUp?: boolean
}

export type {
  AppSettings,
  HotkeyConfig,
  ChatAttachment,
  TranscriptionProvider,
  TranscriptionSettings,
  TranscriptionMode,
  LocalModel,
  CloudProvider,
  TranscriptionLanguage,
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
  deriveTranscriptionProvider,
  DEFAULT_LLM,
  DEFAULT_SUMMARIZATION,
  DEFAULT_SUMMARIZER_SYSTEM_PROMPT,
  MODEL_CONFIGS,
  MODEL_PRICING,
  estimateMessageCost,
} from './settings'

// Insight types (Live Insights feature)
export type {
  DetectedEventType,
  DetectedEvent,
  InsightActionType,
  InsightAction,
  Insight,
  WebSearchResult,
} from './insights'

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
