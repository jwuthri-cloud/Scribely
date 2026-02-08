import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { applyInvisibility } from './invisibility'
import { registerAllHotkeys, unregisterAllHotkeys, reregisterHotkeys } from './hotkey'
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

const store = new Store<AppSettings>({
  defaults: {
    themeId: 'atom-dark',
    hotkeys: {
      toggleOverlay: 'Alt+T',
      moveUp: 'Alt+Up',
      moveDown: 'Alt+Down',
      moveLeft: 'Alt+Left',
      moveRight: 'Alt+Right',
      takeScreenshot: 'Alt+S',
      toggleAudio: 'Alt+A',
      resetChat: 'Alt+R',
    },
    moveStepPx: 50,
    windowOpacity: 0.85,
  },
})

let mainWindow: BrowserWindow | null = null
let pendingResponseTimer: ReturnType<typeof setTimeout> | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Apply macOS screen-sharing invisibility
  applyInvisibility(mainWindow)

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Register all global hotkeys
  registerAllHotkeys(mainWindow, store)
}

function registerIpcHandlers(): void {
  // ── Settings ──────────────────────────────────────
  ipcMain.handle('get-settings', () => {
    return store.store
  })

  ipcMain.on('update-settings', (_event, partial: Partial<AppSettings>) => {
    const oldHotkeys = JSON.stringify(store.get('hotkeys'))

    // Merge partial settings
    for (const [key, value] of Object.entries(partial)) {
      if (key === 'hotkeys' && typeof value === 'object') {
        // Deep merge hotkeys
        const current = store.get('hotkeys')
        store.set('hotkeys', { ...current, ...(value as Partial<HotkeyConfig>) })
      } else {
        store.set(key as keyof AppSettings, value as never)
      }
    }

    const newHotkeys = JSON.stringify(store.get('hotkeys'))

    // Re-register hotkeys if they changed
    if (oldHotkeys !== newHotkeys && mainWindow) {
      reregisterHotkeys(mainWindow, store)
    }

    // Notify renderer that settings changed
    if (mainWindow) {
      mainWindow.webContents.send('settings-changed', store.store)
    }
  })

  // ── Legacy theme IPC (kept for backward compat during migration) ──
  ipcMain.handle('get-theme-id', () => {
    return store.get('themeId', 'atom-dark')
  })

  ipcMain.on('set-theme-id', (_event, themeId: string) => {
    store.set('themeId', themeId)
  })

  // ── Screenshot ────────────────────────────────────
  ipcMain.handle('take-screenshot', async () => {
    if (!mainWindow) throw new Error('No window')
    return captureScreen(mainWindow)
  })

  // ── Chat ──────────────────────────────────────────
  ipcMain.on('send-message', (_event, message: string) => {
    console.log('[ipc] Received message:', message)
    if (mainWindow) {
      pendingResponseTimer = setTimeout(() => {
        mainWindow!.webContents.send(
          'chat-response',
          `You said: "${message}"\n\n(Placeholder — backend integration coming soon.)`,
        )
        pendingResponseTimer = null
      }, 600)
    }
  })

  ipcMain.on('cancel-response', () => {
    if (pendingResponseTimer) {
      clearTimeout(pendingResponseTimer)
      pendingResponseTimer = null
      console.log('[ipc] Response cancelled')
    }
  })

  // ── App lifecycle ─────────────────────────────────
  ipcMain.on('app-quit', () => {
    app.quit()
  })
}

// Hide the dock icon on macOS so the overlay is truly minimal
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  unregisterAllHotkeys()
})
