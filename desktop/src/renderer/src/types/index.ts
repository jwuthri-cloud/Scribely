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

  // Reset chat
  onResetChat: (callback: () => void) => () => void

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

export type { AppSettings, HotkeyConfig, ChatAttachment } from './settings'
export { HOTKEY_LABELS, DEFAULT_HOTKEYS, DEFAULT_SETTINGS } from './settings'
