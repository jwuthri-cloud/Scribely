import type { ChatAttachment, AppSettings } from './settings'

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

  // Reset chat
  onResetChat: (callback: () => void) => () => void

  // Invisibility
  toggleInvisibility: () => Promise<boolean>
  getInvisibility: () => Promise<boolean>

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
  timestamp: number
  attachments?: ChatAttachment[]
}

export type { AppSettings, HotkeyConfig, ChatAttachment, TranscriptionProvider, TranscriptionSettings } from './settings'
export { HOTKEY_LABELS, DEFAULT_HOTKEYS, DEFAULT_SETTINGS, DEFAULT_TRANSCRIPTION } from './settings'

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
