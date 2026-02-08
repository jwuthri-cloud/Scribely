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

  // ── Reset chat ──────────────────────────────────
  onResetChat: (callback: () => void) => () => void

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

  // ── Reset chat ──────────────────────────────────
  onResetChat: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('reset-chat', handler)
    return () => ipcRenderer.removeListener('reset-chat', handler)
  },

  // ── App lifecycle ───────────────────────────────
  quit: () => {
    ipcRenderer.send('app-quit')
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
