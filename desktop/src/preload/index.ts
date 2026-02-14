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
  llmTriggerSummarize: (payload?: { transcriptEntries?: unknown[] }) => Promise<{ success: boolean; error?: string }>
  llmGetSummarizationStatus: () => Promise<{
    hasSummary: boolean
    inProgress: boolean
    autoSummarizeEnabled: boolean
  }>
  llmGetSummary: () => Promise<string | null>

  // ── Settings ────────────────────────────────────
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => void
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void

  // ── Legacy theme (kept for ThemeProvider compat) ─
  getThemeId: () => Promise<string>
  setThemeId: (themeId: string) => void

  // ── Screenshot ──────────────────────────────────
  takeScreenshot: () => Promise<string>
  onScreenshotTaken: (callback: (dataUrl: string) => void) => () => void

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
  stopExtensionCapture: () => Promise<{ success: boolean }>

  // ── Meeting toggle ─────────────────────────────
  onToggleMeeting: (callback: () => void) => () => void

  // ── Reset chat ──────────────────────────────────
  onResetChat: (callback: () => void) => () => void

  // ── Invisibility ──────────────────────────────
  toggleInvisibility: () => Promise<boolean>
  getInvisibility: () => Promise<boolean>

  // ── Onboarding ───────────────────────────────────
  onboardingGetCompleted: () => Promise<boolean>
  onboardingSetCompleted: (completed: boolean) => Promise<{ success: boolean }>

  // ── Open external URL ────────────────────────────
  openExternalUrl: (url: string) => Promise<{ success: boolean }>

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

  llmTriggerSummarize: (payload?: { transcriptEntries?: unknown[] }) => {
    return ipcRenderer.invoke('llm:trigger-summarize', payload)
  },

  llmGetSummarizationStatus: () => {
    return ipcRenderer.invoke('llm:get-summarization-status')
  },

  llmGetSummary: () => {
    return ipcRenderer.invoke('llm:get-summary')
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

  // ── Invisibility ──────────────────────────────
  toggleInvisibility: () => {
    return ipcRenderer.invoke('toggle-invisibility')
  },

  getInvisibility: () => {
    return ipcRenderer.invoke('get-invisibility')
  },

  // ── Onboarding ───────────────────────────────────
  onboardingGetCompleted: () => {
    return ipcRenderer.invoke('onboarding:get-completed')
  },

  onboardingSetCompleted: (completed: boolean) => {
    return ipcRenderer.invoke('onboarding:set-completed', completed)
  },

  openExternalUrl: (url: string) => {
    return ipcRenderer.invoke('open-external-url', url)
  },

  // ── App lifecycle ───────────────────────────────
  quit: () => {
    ipcRenderer.send('app-quit')
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
