import { globalShortcut, BrowserWindow } from 'electron'
import type Store from 'electron-store'
import { createLogger } from './logger'
import { captureScreen } from './screenshot'

const log = createLogger('hotkey')

interface HotkeyConfig {
  toggleOverlay: string
  moveUp: string
  moveDown: string
  moveLeft: string
  moveRight: string
  takeScreenshot: string
  toggleAudio: string
  resetChat: string
  toggleMeeting: string
  focusChatInput: string
}

// Must match main's TranscriptionSettings for Store compatibility
interface TranscriptionSettings {
  mode?: 'local' | 'cloud'
  localModel?: 'fast' | 'balanced' | 'accurate'
  cloudProvider?: string
  cloudModel?: string
  language?: 'en' | 'multi'
  provider?: string
  chunkDurationSec?: number
  apiKeys?: Record<string, string>
}

interface LLMSettings {
  apiKey: string
  defaultModel: string
  temperature: number
  activeSystemPromptId: string | null
  systemPrompts: Array<{
    id: string
    name: string
    content: string
    createdAt: number
    updatedAt: number
  }>
}

interface AppSettings {
  themeId: string
  hotkeys: HotkeyConfig
  moveStepPx: number
  windowOpacity: number
  fontSize?: 'small' | 'medium' | 'large'
  transcription: TranscriptionSettings
  llm: LLMSettings
}

/**
 * Registers all global hotkeys based on the current settings.
 */
export function registerAllHotkeys(
  win: BrowserWindow,
  store: Store<AppSettings>,
): void {
  const settings = store.store as AppSettings
  const { hotkeys, moveStepPx } = settings

  // Guard: hotkey callbacks can fire after window is closed (e.g. on macOS when app stays running)
  const guard = (fn: () => void) => () => {
    if (win.isDestroyed()) return
    fn()
  }

  // Toggle overlay visibility
  tryRegister(hotkeys.toggleOverlay, guard(() => {
    if (win.isVisible()) {
      win.webContents.send('toggle-visibility', false)
      setTimeout(() => {
        if (!win.isDestroyed()) win.hide()
      }, 200)
    } else {
      win.show()
      win.webContents.send('toggle-visibility', true)
    }
  }))

  // Move window
  tryRegister(hotkeys.moveUp, guard(() => {
    const [x, y] = win.getPosition()
    win.setPosition(x, y - moveStepPx)
  }))

  tryRegister(hotkeys.moveDown, guard(() => {
    const [x, y] = win.getPosition()
    win.setPosition(x, y + moveStepPx)
  }))

  tryRegister(hotkeys.moveLeft, guard(() => {
    const [x, y] = win.getPosition()
    win.setPosition(x - moveStepPx, y)
  }))

  tryRegister(hotkeys.moveRight, guard(() => {
    const [x, y] = win.getPosition()
    win.setPosition(x + moveStepPx, y)
  }))

  // Screenshot
  tryRegister(hotkeys.takeScreenshot, guard(async () => {
    try {
      const dataUrl = await captureScreen(win)
      if (!win.isDestroyed()) win.webContents.send('screenshot-taken', dataUrl)
    } catch (err) {
      log.error('Screenshot failed:', err)
    }
  }))

  // Toggle audio recording
  tryRegister(hotkeys.toggleAudio, guard(() => {
    win.webContents.send('toggle-audio')
  }))

  // Reset chat
  tryRegister(hotkeys.resetChat, guard(() => {
    win.webContents.send('reset-chat')
  }))

  // Toggle meeting recording
  tryRegister(hotkeys.toggleMeeting, guard(() => {
    win.webContents.send('toggle-meeting')
  }))

  // Focus chat input ("Ask anything")
  tryRegister(hotkeys.focusChatInput, guard(() => {
    if (!win.isVisible()) {
      win.show()
      win.webContents.send('toggle-visibility', true)
    }
    win.focus()
    win.webContents.send('focus-chat-input')
  }))
}

/**
 * Unregisters all global shortcuts.
 */
export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
}

/**
 * Re-registers all hotkeys (unregister old, register new).
 */
export function reregisterHotkeys(
  win: BrowserWindow,
  store: Store<AppSettings>,
): void {
  unregisterAllHotkeys()
  registerAllHotkeys(win, store)
}

function tryRegister(accelerator: string, callback: () => void): void {
  if (!accelerator) return
  const ok = globalShortcut.register(accelerator, callback)
  if (!ok) {
    log.error(`Failed to register: ${accelerator}`)
  } else {
    log.success(`Registered: ${accelerator}`)
  }
}
