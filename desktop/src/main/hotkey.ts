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
}

interface AppSettings {
  themeId: string
  hotkeys: HotkeyConfig
  moveStepPx: number
  windowOpacity: number
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

  // Toggle overlay visibility
  tryRegister(hotkeys.toggleOverlay, () => {
    if (win.isVisible()) {
      win.webContents.send('toggle-visibility', false)
      setTimeout(() => win.hide(), 200)
    } else {
      win.show()
      win.webContents.send('toggle-visibility', true)
    }
  })

  // Move window
  tryRegister(hotkeys.moveUp, () => {
    const [x, y] = win.getPosition()
    win.setPosition(x, y - moveStepPx)
  })

  tryRegister(hotkeys.moveDown, () => {
    const [x, y] = win.getPosition()
    win.setPosition(x, y + moveStepPx)
  })

  tryRegister(hotkeys.moveLeft, () => {
    const [x, y] = win.getPosition()
    win.setPosition(x - moveStepPx, y)
  })

  tryRegister(hotkeys.moveRight, () => {
    const [x, y] = win.getPosition()
    win.setPosition(x + moveStepPx, y)
  })

  // Screenshot
  tryRegister(hotkeys.takeScreenshot, async () => {
    try {
      const dataUrl = await captureScreen(win)
      win.webContents.send('screenshot-taken', dataUrl)
    } catch (err) {
      console.error('[hotkey] Screenshot failed:', err)
    }
  })

  // Toggle audio recording
  tryRegister(hotkeys.toggleAudio, () => {
    win.webContents.send('toggle-audio')
  })

  // Reset chat
  tryRegister(hotkeys.resetChat, () => {
    win.webContents.send('reset-chat')
  })
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
