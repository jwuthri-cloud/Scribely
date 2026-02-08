import { globalShortcut, BrowserWindow } from 'electron'

const HOTKEY = 'CommandOrControl+Shift+Space'

/**
 * Registers the global hotkey (Cmd+Shift+Space) that toggles overlay visibility.
 * Sends an IPC message to the renderer so it can animate the transition.
 */
export function registerGlobalHotkey(win: BrowserWindow): void {
  const registered = globalShortcut.register(HOTKEY, () => {
    if (win.isVisible()) {
      win.webContents.send('toggle-visibility', false)
      // Small delay so the renderer can play the fade-out animation
      setTimeout(() => win.hide(), 200)
    } else {
      win.show()
      win.webContents.send('toggle-visibility', true)
    }
  })

  if (!registered) {
    console.error(`[hotkey] Failed to register global shortcut: ${HOTKEY}`)
  } else {
    console.log(`[hotkey] Registered global shortcut: ${HOTKEY}`)
  }
}

/**
 * Unregisters all global shortcuts. Call on app quit.
 */
export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
}
