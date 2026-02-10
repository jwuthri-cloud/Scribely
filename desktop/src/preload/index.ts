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

  // ── Chat ────────────────────────────────────────
  sendMessage: (message: string) => void
  onMessage: (callback: (response: string) => void) => () => void
  cancelResponse: () => void

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

  // ── Reset chat ──────────────────────────────────
  onResetChat: (callback: () => void) => () => void

  // ── Invisibility ──────────────────────────────
  toggleInvisibility: () => Promise<boolean>
  getInvisibility: () => Promise<boolean>

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

  // ── Chat ────────────────────────────────────────
  sendMessage: (message: string) => {
    ipcRenderer.send('send-message', message)
  },

  onMessage: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, response: string) => {
      callback(response)
    }
    ipcRenderer.on('chat-response', handler)
    return () => ipcRenderer.removeListener('chat-response', handler)
  },

  cancelResponse: () => {
    ipcRenderer.send('cancel-response')
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

  // ── App lifecycle ───────────────────────────────
  quit: () => {
    ipcRenderer.send('app-quit')
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
