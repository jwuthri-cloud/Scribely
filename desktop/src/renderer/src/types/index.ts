import type { ElectronAPI } from '../../../preload/index'

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
}

export type { ElectronAPI }
