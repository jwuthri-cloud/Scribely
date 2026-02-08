export interface HotkeyConfig {
  toggleOverlay: string
  moveUp: string
  moveDown: string
  moveLeft: string
  moveRight: string
  takeScreenshot: string
  toggleAudio: string
  resetChat: string
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
}

export interface AppSettings {
  themeId: string
  hotkeys: HotkeyConfig
  moveStepPx: number
  windowOpacity: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'atom-dark',
  hotkeys: { ...DEFAULT_HOTKEYS },
  moveStepPx: 50,
  windowOpacity: 0.85,
}

export interface ChatAttachment {
  type: 'image'
  data: string // base64 data URL
  label?: string
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
}
