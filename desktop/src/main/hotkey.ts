import { globalShortcut, BrowserWindow } from 'electron'
import type Store from 'electron-store'
import { captureScreen } from './screenshot'

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
}

interface TranscriptionSettings {
  provider: string
  chunkDurationSec: number
}

interface AppSettings {
  themeId: string
  hotkeys: HotkeyConfig
  moveStepPx: number
  windowOpacity: number
  transcription: TranscriptionSettings
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
      console.error('[hotkey] Screenshot failed:', err)
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
    console.error(`[hotkey] Failed to register: ${accelerator}`)
  } else {
    console.log(`[hotkey] Registered: ${accelerator}`)
  }
}
