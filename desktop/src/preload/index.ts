import { contextBridge, ipcRenderer } from 'electron'

interface AppSettings {
  themeId: string
  hotkeys: Record<string, string>
  moveStepPx: number
  windowOpacity: number
}

export interface ElectronAPI {
  // ── Visibility ──────────────────────────────────
  onToggleVisibility: (callback: (visible: boolean) => void) => () => void

  // ── Chat (legacy) ──────────────────────────────
  sendMessage: (message: string) => void
  onMessage: (callback: (response: string) => void) => () => void
  cancelResponse: () => void

  // ── LLM ────────────────────────────────────────
  llmChat: (request: any) => void
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
  llmListLocalModels: () => Promise<{ models: Array<{ id: string; name: string; contextWindow: number; maxResponseTokens: number }>; error?: string }>
  llmTestLocalConnection: () => Promise<{ ok: boolean; error?: string }>
  llmProbeLocalProviders: () => Promise<{
    ollama: { ok: boolean; models: Array<{ id: string; name: string }>; error?: string }
    lmstudio: { ok: boolean; models: Array<{ id: string; name: string }>; error?: string }
  }>
  llmSetTemperature: (temperature: number) => Promise<{ success: boolean }>
  onLLMChatDelta: (callback: (data: any) => void) => () => void
  onLLMChatDone: (callback: (data: any) => void) => () => void
  onLLMChatError: (callback: (data: any) => void) => () => void

  // ── System Prompts ─────────────────────────────
  llmGetSystemPrompts: () => Promise<any[]>
  llmCreateSystemPrompt: (prompt: { name: string; content: string }) => Promise<any>
  llmUpdateSystemPrompt: (prompt: { id: string; name: string; content: string }) => Promise<any>
  llmDeleteSystemPrompt: (id: string) => Promise<{ success: boolean }>
  llmSetActiveSystemPrompt: (id: string | null) => Promise<{ success: boolean }>
  llmGetActiveSystemPrompt: () => Promise<string | null>
  llmGetBuiltInDefaultSystemPrompt: () => Promise<string>
  llmTriggerSummarize: (payload?: { transcriptEntries?: unknown[] }) => Promise<{ success: boolean; error?: string }>
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

  // ── Live Insights ───────────────────────────────
  onInsightNew: (callback: (insight: unknown) => void) => () => void
  onInsightUpdate: (callback: (update: unknown) => void) => () => void
  llmWebSearch: (query: string) => Promise<unknown>
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

  // ── Auth ──────────────────────────────────────────
  authStartSignIn: () => Promise<{ success: boolean; error?: string }>
  authSkip: () => Promise<void>
  authGetState: () => Promise<{ mode: 'guest' | 'authenticated'; user: { id: string; email: string; firstName: string | null; lastName: string | null; fullName: string | null; imageUrl: string | null } | null }>
  authSignOut: () => Promise<void>
  authGetUserProfile: () => Promise<{ id: string; email: string; firstName: string | null; lastName: string | null; fullName: string | null; imageUrl: string | null } | null>
  onAuthStateChanged: (callback: (state: { mode: 'guest' | 'authenticated'; user: { id: string; email: string; firstName: string | null; lastName: string | null; fullName: string | null; imageUrl: string | null } | null }) => void) => () => void
  onAuthTokenExpired: (callback: () => void) => () => void

  // ── Backend Sync ─────────────────────────────────
  backendSyncMeeting: (payload: {
    /** Absolute path to the saved transcript JSON file (required) */
    transcriptFilepath: string
    /** Absolute path to the webm recording file (optional) */
    recordingFilepath?: string
    /** Meeting session ID (optional) */
    sessionId?: string
  }) => Promise<{ success: boolean; message: string; meetingId?: string }>

  backendValidateAuth: () => Promise<{ authenticated: boolean; userId?: string }>

  // ── Upload Queue ─────────────────────────────────
  uploadQueueGetHistory: () => Promise<any[]>
  uploadQueueRetryItem: (id: string) => Promise<void>
  uploadQueueClearItem: (id: string) => Promise<void>
  uploadQueueClearAll: () => Promise<void>
  onUploadQueueChanged: (callback: (items: any[]) => void) => () => void

  // ── Settings ────────────────────────────────────
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => void
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void

  // ── App updates (electron-updater) ────────────────
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

  // ── Legacy theme (kept for ThemeProvider compat) ─
  getThemeId: () => Promise<string>
  setThemeId: (themeId: string) => void

  // ── Screenshot ──────────────────────────────────
  takeScreenshot: () => Promise<string>
  onScreenshotTaken: (callback: (dataUrl: string) => void) => () => void
  checkScreenRecordingPermission: () => Promise<boolean>
  checkAccessibilityPermission: () => Promise<boolean>

  // ── Audio ───────────────────────────────────────
  onToggleAudio: (callback: () => void) => () => void

  // ── Meeting / Transcription ─────────────────────
  startMeetingSession: () => Promise<{
    sessionId: string
    transcriptionMode: string
    vadEnabled: boolean
  }>
  stopMeetingSession: () => Promise<{ success: boolean }>
  /** Stream a small audio frame to the main process for VAD + transcription */
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
  }) => Promise<{ filepath: string; filename: string }>
  getModelStatus: () => Promise<unknown>
  downloadWhisperModel: () => Promise<{
    success: boolean
    path?: string
    mode?: string
    error?: string
  }>
  onTranscriptEntry: (callback: (entry: unknown) => void) => () => void
  onMeetingStatusUpdate: (callback: (update: unknown) => void) => () => void
  onModelProgress: (callback: (data: { modelId: string; progress: number }) => void) => () => void
  onModelComplete: (callback: (data: { modelId: string; path: string }) => void) => () => void

  // ── Screen Recording (main-process driven) ─────
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

  // ── Audio Levels (waveform visualization) ──────
  onAudioLevels: (
    callback: (levels: { mic: number; system: number; timestamp: number }) => void,
  ) => () => void

  // ── Native Capture ─────────────────────────────
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

  // ── Chrome Extension Capture ───────────────────
  getExtensionStatus: () => Promise<{ connected: boolean }>
  onExtensionStatusChanged: (
    callback: (status: { connected: boolean }) => void,
  ) => () => void
  onExtensionAutoStartMeeting: (callback: () => void) => () => void
  onExtensionAutoStopMeeting: (callback: () => void) => () => void
  stopExtensionCapture: () => Promise<{ success: boolean; filepath?: string }>

  // ── Meeting toggle ─────────────────────────────
  onToggleMeeting: (callback: () => void) => () => void

  // ── Reset chat ──────────────────────────────────
  onResetChat: (callback: () => void) => () => void

  // ── Focus chat input ─────────────────────────────
  onFocusChatInput: (callback: () => void) => () => void

  // ── Invisibility ──────────────────────────────
  toggleInvisibility: () => Promise<boolean>
  getInvisibility: () => Promise<boolean>

  // ── Window hide/show ─────────────────────────────
  toggleWindowVisibility: () => Promise<void>

  // ── Onboarding ───────────────────────────────────
  onboardingGetCompleted: () => Promise<boolean>
  onboardingSetCompleted: (completed: boolean) => Promise<{ success: boolean }>

  // ── Clipboard ────────────────────────────────────
  clipboardWriteText: (text: string) => Promise<void>

  // ── Open external URL ────────────────────────────
  openExternalUrl: (url: string) => Promise<{ success: boolean }>

  // ── Window resize ──────────────────────────────
  setWindowSize: (size: { width: number; height: number }) => void

  // ── App lifecycle ───────────────────────────────
  quit: () => void
}

const api: ElectronAPI = {
  // ── Visibility ──────────────────────────────────
  onToggleVisibility: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => {
      callback(visible)
    }
    ipcRenderer.on('toggle-visibility', handler)
    return () => ipcRenderer.removeListener('toggle-visibility', handler)
  },

  // ── Chat (legacy — kept for backward compat, no-ops) ──
  sendMessage: (_message: string) => {
    // Deprecated: use llmChat() instead
  },

  onMessage: (_callback) => {
    // Deprecated: use onLLMChatDelta/Done/Error instead
    return () => {}
  },

  cancelResponse: () => {
    // Deprecated: use llmCancel() instead
  },

  // ── LLM ────────────────────────────────────────
  llmChat: (request) => {
    ipcRenderer.send('llm:chat', request)
  },

  llmCancel: (requestId: string) => {
    ipcRenderer.send('llm:cancel', requestId)
  },

  llmReset: () => {
    ipcRenderer.send('llm:reset')
  },

  llmSetModel: (modelId) => {
    return ipcRenderer.invoke('llm:set-model', modelId)
  },

  llmGetModel: () => {
    return ipcRenderer.invoke('llm:get-model')
  },

  llmSetApiKey: (apiKey: string) => {
    return ipcRenderer.invoke('llm:set-api-key', apiKey)
  },

  llmHasApiKey: () => {
    return ipcRenderer.invoke('llm:has-api-key')
  },

  llmGetProvider: () => ipcRenderer.invoke('llm:get-provider'),
  llmSetProvider: (provider: 'openai' | 'ollama' | 'lmstudio') =>
    ipcRenderer.invoke('llm:set-provider', provider),
  llmGetLocalBaseUrl: () => ipcRenderer.invoke('llm:get-local-base-url'),
  llmSetLocalBaseUrl: (baseUrl: string) =>
    ipcRenderer.invoke('llm:set-local-base-url', baseUrl),
  llmListLocalModels: () => ipcRenderer.invoke('llm:list-local-models'),
  llmTestLocalConnection: () => ipcRenderer.invoke('llm:test-local-connection'),
  llmProbeLocalProviders: () => ipcRenderer.invoke('llm:probe-local-providers'),

  onLLMChatDelta: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => {
      callback(data)
    }
    ipcRenderer.on('llm:chat-delta', handler)
    return () => ipcRenderer.removeListener('llm:chat-delta', handler)
  },

  onLLMChatDone: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => {
      callback(data)
    }
    ipcRenderer.on('llm:chat-done', handler)
    return () => ipcRenderer.removeListener('llm:chat-done', handler)
  },

  onLLMChatError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => {
      callback(data)
    }
    ipcRenderer.on('llm:chat-error', handler)
    return () => ipcRenderer.removeListener('llm:chat-error', handler)
  },

  // ── LLM Temperature ─────────────────────────────
  llmSetTemperature: (temperature: number) => {
    return ipcRenderer.invoke('llm:set-temperature', temperature)
  },

  // ── System Prompts ──────────────────────────────
  llmGetSystemPrompts: () => {
    return ipcRenderer.invoke('llm:get-system-prompts')
  },

  llmCreateSystemPrompt: (prompt: { name: string; content: string }) => {
    return ipcRenderer.invoke('llm:create-system-prompt', prompt)
  },

  llmUpdateSystemPrompt: (prompt: { id: string; name: string; content: string }) => {
    return ipcRenderer.invoke('llm:update-system-prompt', prompt)
  },

  llmDeleteSystemPrompt: (id: string) => {
    return ipcRenderer.invoke('llm:delete-system-prompt', id)
  },

  llmSetActiveSystemPrompt: (id: string | null) => {
    return ipcRenderer.invoke('llm:set-active-system-prompt', id)
  },

  llmGetActiveSystemPrompt: () => {
    return ipcRenderer.invoke('llm:get-active-system-prompt')
  },

  llmGetBuiltInDefaultSystemPrompt: () => {
    return ipcRenderer.invoke('llm:get-built-in-default-system-prompt')
  },

  llmTriggerSummarize: (payload?: { transcriptEntries?: unknown[] }) => {
    return ipcRenderer.invoke('llm:trigger-summarize', payload)
  },

  llmGetSummarizationStatus: () => {
    return ipcRenderer.invoke('llm:get-summarization-status')
  },

  llmGetSummary: () => {
    return ipcRenderer.invoke('llm:get-summary')
  },

  onLLMSummaryUpdated: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('llm:summary-updated', handler)
    return () => ipcRenderer.removeListener('llm:summary-updated', handler)
  },

  llmGetPromptForRequest: (requestId: string) => {
    return ipcRenderer.invoke('llm:get-prompt-for-request', requestId)
  },

  llmGetUsageStats: () => {
    return ipcRenderer.invoke('llm:get-usage-stats')
  },

  onLLMUsageUpdated: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('llm:usage-updated', handler)
    return () => ipcRenderer.removeListener('llm:usage-updated', handler)
  },

  onInsightNew: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, insight: unknown) => {
      callback(insight)
    }
    ipcRenderer.on('insight:new', handler)
    return () => ipcRenderer.removeListener('insight:new', handler)
  },
  onInsightUpdate: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, update: unknown) => {
      callback(update)
    }
    ipcRenderer.on('insight:update', handler)
    return () => ipcRenderer.removeListener('insight:update', handler)
  },

  llmWebSearch: (query: string) => {
    return ipcRenderer.invoke('llm:web-search', query)
  },
  llmSuggestFollowUp: (payload: { prompt: string; transcriptEntries?: Array<{ id: string; speaker: string; text: string; startTime: number; endTime: number; source?: string }> }) => {
    return ipcRenderer.invoke('llm:suggest-follow-up', payload)
  },
  llmWebSearchStream: (payload: { requestId: string; query: string }) => {
    ipcRenderer.send('llm:web-search-stream', payload)
  },
  onLLMWebSearchDelta: (callback: (data: { requestId: string; delta: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { requestId: string; delta: string }) =>
      callback(data)
    ipcRenderer.on('llm:web-search-delta', handler)
    return () => ipcRenderer.removeListener('llm:web-search-delta', handler)
  },
  onLLMWebSearchDone: (
    callback: (data: {
      requestId: string
      content: string
      sources?: Array<{ title: string; url: string }>
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { requestId: string; content: string; sources?: Array<{ title: string; url: string }> },
    ) => callback(data)
    ipcRenderer.on('llm:web-search-done', handler)
    return () => ipcRenderer.removeListener('llm:web-search-done', handler)
  },
  onLLMWebSearchError: (callback: (data: { requestId: string; error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { requestId: string; error: string }) =>
      callback(data)
    ipcRenderer.on('llm:web-search-error', handler)
    return () => ipcRenderer.removeListener('llm:web-search-error', handler)
  },
  sendToChat: (text: string) => ipcRenderer.invoke('insights:send-to-chat', text),
  onChatMessageFromInsights: (callback: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text)
    ipcRenderer.on('chat:message-from-insights', handler)
    return () => ipcRenderer.removeListener('chat:message-from-insights', handler)
  },

  // ── Auth ──────────────────────────────────────────
  authStartSignIn: () => {
    return ipcRenderer.invoke('auth:start-sign-in')
  },

  authSkip: () => {
    return ipcRenderer.invoke('auth:skip')
  },

  authGetState: () => {
    return ipcRenderer.invoke('auth:get-state')
  },

  authSignOut: () => {
    return ipcRenderer.invoke('auth:sign-out')
  },

  authGetUserProfile: () => {
    return ipcRenderer.invoke('auth:get-user-profile')
  },

  onAuthStateChanged: (callback: (state: { mode: 'guest' | 'authenticated'; user: { id: string; email: string; firstName: string | null; lastName: string | null; fullName: string | null; imageUrl: string | null } | null }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: any) => callback(state)
    ipcRenderer.on('auth:state-changed', handler)
    return () => ipcRenderer.removeListener('auth:state-changed', handler)
  },

  onAuthTokenExpired: (callback: () => void) => {
    const handler = (_event: Electron.IpcRendererEvent) => callback()
    ipcRenderer.on('auth:token-expired', handler)
    return () => ipcRenderer.removeListener('auth:token-expired', handler)
  },

  // ── Backend Sync ─────────────────────────────────
  backendSyncMeeting: (payload: {
    transcriptFilepath: string
    recordingFilepath?: string
    sessionId?: string
  }) => {
    return ipcRenderer.invoke('backend:sync-meeting', payload)
  },

  backendValidateAuth: () => {
    return ipcRenderer.invoke('backend:validate-auth')
  },

  // ── Upload Queue ─────────────────────────────────
  uploadQueueGetHistory: () => {
    return ipcRenderer.invoke('upload-queue:get-history')
  },

  uploadQueueRetryItem: (id: string) => {
    return ipcRenderer.invoke('upload-queue:retry-item', id)
  },

  uploadQueueClearItem: (id: string) => {
    return ipcRenderer.invoke('upload-queue:clear-item', id)
  },

  uploadQueueClearAll: () => {
    return ipcRenderer.invoke('upload-queue:clear-all')
  },

  onUploadQueueChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, items: any[]) => {
      callback(items)
    }
    ipcRenderer.on('upload-queue:changed', handler)
    return () => ipcRenderer.removeListener('upload-queue:changed', handler)
  },

  // ── Settings ────────────────────────────────────
  getSettings: () => {
    return ipcRenderer.invoke('get-settings')
  },

  updateSettings: (partial: Partial<AppSettings>) => {
    ipcRenderer.send('update-settings', partial)
  },

  onSettingsChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings) => {
      callback(settings)
    }
    ipcRenderer.on('settings-changed', handler)
    return () => ipcRenderer.removeListener('settings-changed', handler)
  },

  updaterGetStatus: () => ipcRenderer.invoke('updater:get-status'),
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterQuitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  onUpdaterChecking: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('updater:checking', handler)
    return () => ipcRenderer.removeListener('updater:checking', handler)
  },
  onUpdaterUpdateAvailable: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info)
    ipcRenderer.on('updater:update-available', handler)
    return () => ipcRenderer.removeListener('updater:update-available', handler)
  },
  onUpdaterUpdateNotAvailable: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('updater:update-not-available', handler)
    return () => ipcRenderer.removeListener('updater:update-not-available', handler)
  },
  onUpdaterError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data)
    ipcRenderer.on('updater:error', handler)
    return () => ipcRenderer.removeListener('updater:error', handler)
  },
  onUpdaterDownloadProgress: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { percent: number; transferred: number; total: number },
    ) => callback(data)
    ipcRenderer.on('updater:download-progress', handler)
    return () => ipcRenderer.removeListener('updater:download-progress', handler)
  },
  onUpdaterUpdateDownloaded: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { version: string }) => callback(data)
    ipcRenderer.on('updater:update-downloaded', handler)
    return () => ipcRenderer.removeListener('updater:update-downloaded', handler)
  },

  // ── Legacy theme ────────────────────────────────
  getThemeId: () => {
    return ipcRenderer.invoke('get-theme-id')
  },

  setThemeId: (themeId: string) => {
    ipcRenderer.send('set-theme-id', themeId)
  },

  // ── Screenshot ──────────────────────────────────
  takeScreenshot: () => {
    return ipcRenderer.invoke('take-screenshot')
  },

  checkScreenRecordingPermission: () => {
    return ipcRenderer.invoke('check-screen-recording-permission') as Promise<boolean>
  },

  checkAccessibilityPermission: () => {
    return ipcRenderer.invoke('check-accessibility-permission') as Promise<boolean>
  },

  onScreenshotTaken: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, dataUrl: string) => {
      callback(dataUrl)
    }
    ipcRenderer.on('screenshot-taken', handler)
    return () => ipcRenderer.removeListener('screenshot-taken', handler)
  },

  // ── Audio ───────────────────────────────────────
  onToggleAudio: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('toggle-audio', handler)
    return () => ipcRenderer.removeListener('toggle-audio', handler)
  },

  // ── Meeting / Transcription ─────────────────────
  startMeetingSession: () => {
    return ipcRenderer.invoke('meeting:start-session')
  },

  stopMeetingSession: () => {
    return ipcRenderer.invoke('meeting:stop-session')
  },

  streamAudioFrame: (payload) => {
    ipcRenderer.send('meeting:audio-frame', payload)
  },

  setExcludeMyMic: (value: boolean) => {
    ipcRenderer.send('meeting:set-exclude-mic', value)
  },

  transcribeAudioChunk: (payload) => {
    return ipcRenderer.invoke('meeting:transcribe-chunk', payload)
  },

  saveMeetingRecording: (payload) => {
    return ipcRenderer.invoke('meeting:save-recording', payload)
  },

  initRecordingFile: (payload) => {
    return ipcRenderer.invoke('meeting:init-recording-file', payload)
  },

  appendRecordingChunk: (payload) => {
    return ipcRenderer.invoke('meeting:append-recording-chunk', payload)
  },

  saveTranscript: (payload) => {
    return ipcRenderer.invoke('meeting:save-transcript', payload)
  },

  getModelStatus: () => {
    return ipcRenderer.invoke('meeting:get-model-status')
  },

  downloadWhisperModel: () => {
    return ipcRenderer.invoke('meeting:download-model')
  },

  onTranscriptEntry: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: unknown) => {
      callback(entry)
    }
    ipcRenderer.on('meeting:transcript-entry', handler)
    return () => ipcRenderer.removeListener('meeting:transcript-entry', handler)
  },

  onMeetingStatusUpdate: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, update: unknown) => {
      callback(update)
    }
    ipcRenderer.on('meeting:status-update', handler)
    return () => ipcRenderer.removeListener('meeting:status-update', handler)
  },

  onModelProgress: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { modelId: string; progress: number },
    ) => {
      callback(data)
    }
    ipcRenderer.on('meeting:model-progress', handler)
    return () => ipcRenderer.removeListener('meeting:model-progress', handler)
  },

  onModelComplete: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { modelId: string; path: string },
    ) => {
      callback(data)
    }
    ipcRenderer.on('meeting:model-complete', handler)
    return () => ipcRenderer.removeListener('meeting:model-complete', handler)
  },

  // ── Screen Recording (main-process driven) ─────
  startRecording: () => {
    return ipcRenderer.invoke('recording:start')
  },

  stopRecording: () => {
    return ipcRenderer.invoke('recording:stop')
  },

  cancelRecording: () => {
    return ipcRenderer.invoke('recording:cancel')
  },

  selectRecordingSource: (sourceId: string) => {
    return ipcRenderer.invoke('recording:select-source', sourceId)
  },

  onShowPicker: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => {
      callback(data)
    }
    ipcRenderer.on('recording:show-picker', handler)
    return () => ipcRenderer.removeListener('recording:show-picker', handler)
  },

  onStartCapture: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { filepath: string },
    ) => {
      callback(data)
    }
    ipcRenderer.on('recording:start-capture', handler)
    return () => ipcRenderer.removeListener('recording:start-capture', handler)
  },

  onStopCapture: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('recording:stop-capture', handler)
    return () => ipcRenderer.removeListener('recording:stop-capture', handler)
  },

  writeRecordingChunk: (payload) => {
    return ipcRenderer.invoke('recording:write-chunk', payload)
  },

  // ── Audio Levels (waveform visualization) ──────
  onAudioLevels: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      levels: { mic: number; system: number; timestamp: number },
    ) => {
      callback(levels)
    }
    ipcRenderer.on('meeting:audio-levels', handler)
    return () => ipcRenderer.removeListener('meeting:audio-levels', handler)
  },

  // ── Native Capture ─────────────────────────────
  startNativeCapture: (options) => {
    return ipcRenderer.invoke('meeting:start-native-capture', options)
  },

  stopNativeCapture: () => {
    return ipcRenderer.invoke('meeting:stop-native-capture')
  },

  getNativeStatus: () => {
    return ipcRenderer.invoke('meeting:get-native-status')
  },

  onNativeStatusChanged: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: {
        available: boolean
        connected: boolean
        processRunning: boolean
        captureState: string
        micActive: boolean
        systemAudioActive: boolean
      },
    ) => {
      callback(status)
    }
    ipcRenderer.on('native:status-changed', handler)
    return () => ipcRenderer.removeListener('native:status-changed', handler)
  },

  onNativeError: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      error: { code: string; message: string },
    ) => {
      callback(error)
    }
    ipcRenderer.on('native:error', handler)
    return () => ipcRenderer.removeListener('native:error', handler)
  },

  // ── Chrome Extension Capture ───────────────────
  getExtensionStatus: () => {
    return ipcRenderer.invoke('extension:get-status')
  },

  onExtensionStatusChanged: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: { connected: boolean },
    ) => {
      callback(status)
    }
    ipcRenderer.on('extension:status-changed', handler)
    return () => ipcRenderer.removeListener('extension:status-changed', handler)
  },

  onExtensionAutoStartMeeting: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('extension:auto-start-meeting', handler)
    return () => ipcRenderer.removeListener('extension:auto-start-meeting', handler)
  },

  onExtensionAutoStopMeeting: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('extension:auto-stop-meeting', handler)
    return () => ipcRenderer.removeListener('extension:auto-stop-meeting', handler)
  },

  stopExtensionCapture: () => {
    return ipcRenderer.invoke('extension:stop-capture')
  },

  // ── Meeting toggle ─────────────────────────────
  onToggleMeeting: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('toggle-meeting', handler)
    return () => ipcRenderer.removeListener('toggle-meeting', handler)
  },

  // ── Reset chat ──────────────────────────────────
  onResetChat: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('reset-chat', handler)
    return () => ipcRenderer.removeListener('reset-chat', handler)
  },

  // ── Focus chat input ─────────────────────────────
  onFocusChatInput: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('focus-chat-input', handler)
    return () => ipcRenderer.removeListener('focus-chat-input', handler)
  },

  // ── Invisibility ──────────────────────────────
  toggleInvisibility: () => {
    return ipcRenderer.invoke('toggle-invisibility')
  },

  getInvisibility: () => {
    return ipcRenderer.invoke('get-invisibility')
  },

  // ── Window hide/show ─────────────────────────────
  toggleWindowVisibility: () => {
    return ipcRenderer.invoke('toggle-window-visibility')
  },

  // ── Onboarding ───────────────────────────────────
  onboardingGetCompleted: () => {
    return ipcRenderer.invoke('onboarding:get-completed')
  },

  onboardingSetCompleted: (completed: boolean) => {
    return ipcRenderer.invoke('onboarding:set-completed', completed)
  },

  clipboardWriteText: (text: string) => {
    return ipcRenderer.invoke('clipboard:write-text', text)
  },

  openExternalUrl: (url: string) => {
    return ipcRenderer.invoke('open-external-url', url)
  },

  // ── Window resize ──────────────────────────────
  setWindowSize: (size: { width: number; height: number }) => {
    ipcRenderer.send('set-window-size', size)
  },

  // ── App lifecycle ───────────────────────────────
  quit: () => {
    ipcRenderer.send('app-quit')
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
