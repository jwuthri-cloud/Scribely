import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  session,
  systemPreferences,
} from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { applyInvisibility } from './invisibility'
import { registerAllHotkeys, unregisterAllHotkeys, reregisterHotkeys } from './hotkey'
import { captureScreen } from './screenshot'
import { AudioPipeline } from './audio/pipeline'

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

interface TranscriptionSettings {
  provider: string
  apiKeys: {
    groq?: string
    deepgram?: string
  }
}

interface AppSettings {
  themeId: string
  hotkeys: HotkeyConfig
  moveStepPx: number
  windowOpacity: number
  transcription: TranscriptionSettings
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
    transcription: {
      provider: 'local-fast',
      apiKeys: {},
    },
  },
})

let mainWindow: BrowserWindow | null = null
let pendingResponseTimer: ReturnType<typeof setTimeout> | null = null
let isInvisible = true // starts invisible (content protection on)

// ── Audio Pipeline ─────────────────────────────────────
const audioPipeline = new AudioPipeline(store.get('transcription'))

// ── Chromium flags for macOS audio loopback ────────────
// These must be set before app.ready(). They enable system audio capture
// even when output goes through Bluetooth (AirPods) or other non-default routes.
app.commandLine.appendSwitch(
  'enable-features',
  [
    'MacLoopbackAudioForScreenShare',
    'MacSckSystemAudioLoopbackOverride',
    'ScreenCaptureKitStreamPickerSonoma',
    'ScreenCaptureKitAudio',
  ].join(','),
)

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

  // ── Grant media permissions to the renderer ──────────────────
  // Without this, getUserMedia() for microphone is silently denied by Electron.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'display-capture', 'mediaKeySystem']
    console.log(`[permissions] Permission request: ${permission} → ${allowed.includes(permission) ? 'granted' : 'denied'}`)
    callback(allowed.includes(permission))
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'display-capture', 'mediaKeySystem']
    return allowed.includes(permission)
  })

  // ── Display Media Handling ─────────────────────────────
  // useSystemPicker (2nd arg) shows the native macOS ScreenCaptureKit picker
  // so the user can choose which screen/window/app to share + toggle audio.
  // The handler only runs as a FALLBACK when the system picker is unavailable.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const { desktopCapturer } = await import('electron')
        const sources = await desktopCapturer.getSources({ types: ['screen'] })
        if (sources.length > 0) {
          console.log('[display-media] Using fallback screen source (system picker unavailable)')
          callback({ video: sources[0], audio: 'loopback' })
        } else {
          console.warn('[display-media] No screen sources available for fallback')
          callback({})
        }
      } catch (err) {
        console.error('[display-media] Fallback handler error:', err)
        callback({})
      }
    },
    { useSystemPicker: true },
  )

  // Connect pipeline to window
  audioPipeline.setWindow(mainWindow)

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
      } else if (key === 'transcription' && typeof value === 'object') {
        // Deep merge transcription settings
        const current = store.get('transcription')
        const incoming = value as Partial<TranscriptionSettings>
        store.set('transcription', {
          ...current,
          ...incoming,
          apiKeys: { ...current.apiKeys, ...incoming.apiKeys },
        })
      } else {
        store.set(key as keyof AppSettings, value as never)
      }
    }

    const newHotkeys = JSON.stringify(store.get('hotkeys'))

    // Re-register hotkeys if they changed
    if (oldHotkeys !== newHotkeys && mainWindow) {
      reregisterHotkeys(mainWindow, store)
    }

    // Notify audio pipeline if transcription settings changed
    if (partial.transcription) {
      audioPipeline.onSettingsChanged(store.get('transcription'))
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

  // ── Invisibility toggle ─────────────────────────────
  ipcMain.handle('toggle-invisibility', () => {
    if (!mainWindow) return isInvisible
    isInvisible = !isInvisible
    mainWindow.setContentProtection(isInvisible)
    return isInvisible
  })

  ipcMain.handle('get-invisibility', () => {
    return isInvisible
  })

  // ── App lifecycle ─────────────────────────────────
  ipcMain.on('app-quit', () => {
    app.quit()
  })
}

// Hide the dock icon on macOS so the overlay is truly minimal
app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.dock.hide()

    // Request microphone permission — triggers the macOS permission dialog
    // on first run so getUserMedia won't fail with "access denied" later.
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus !== 'granted') {
      console.log(`[permissions] Microphone status: ${micStatus} — requesting access…`)
      const granted = await systemPreferences.askForMediaAccess('microphone')
      console.log(`[permissions] Microphone access ${granted ? 'granted' : 'denied'}`)
    }

    // Screen recording permission is handled by the system picker
    // (useSystemPicker: true) — macOS shows the permission flow automatically.
    const screenStatus = systemPreferences.getMediaAccessStatus('screen')
    console.log(`[permissions] Screen recording status: ${screenStatus}`)
  }

  registerIpcHandlers()

  // Initialize audio pipeline (registers its own IPC handlers)
  audioPipeline.registerIpcHandlers()
  await audioPipeline.init()

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
  audioPipeline.destroy()
})
