import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  /** Subscribe to visibility toggle from main process. Returns unsubscribe fn. */
  onToggleVisibility: (callback: (visible: boolean) => void) => () => void

  /** Send a chat message to the main process */
  sendMessage: (message: string) => void

  /** Subscribe to chat responses from main process. Returns unsubscribe fn. */
  onMessage: (callback: (response: string) => void) => () => void

  /** Get persisted theme ID from electron-store */
  getThemeId: () => Promise<string>

  /** Persist theme ID to electron-store */
  setThemeId: (themeId: string) => void

  /** Request the app to quit */
  quit: () => void
}

const api: ElectronAPI = {
  onToggleVisibility: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => {
      callback(visible)
    }
    ipcRenderer.on('toggle-visibility', handler)
    return () => {
      ipcRenderer.removeListener('toggle-visibility', handler)
    }
  },

  sendMessage: (message: string) => {
    ipcRenderer.send('send-message', message)
  },

  onMessage: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, response: string) => {
      callback(response)
    }
    ipcRenderer.on('chat-response', handler)
    return () => {
      ipcRenderer.removeListener('chat-response', handler)
    }
  },

  getThemeId: () => {
    return ipcRenderer.invoke('get-theme-id')
  },

  setThemeId: (themeId: string) => {
    ipcRenderer.send('set-theme-id', themeId)
  },

  quit: () => {
    ipcRenderer.send('app-quit')
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
