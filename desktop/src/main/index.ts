import './instrumentation' // Must be first — Langfuse observability

import {
  app,
  BrowserWindow,
  clipboard,
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
import { NativeHelperBridge } from './native-bridge'
import { ScreenRecorder } from './screen-recorder'
import { ExtensionWsServer } from './ws-server'
import { LLMService } from './llm/llm-service'
import { flushLangfuse } from './instrumentation'

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

interface SummarizationSettings {
  autoSummarizeEnabled: boolean
  stalenessMinutes: number
  thresholdPercent: number
  keepRawCount: number
  summarizerSystemPrompt: string | null
}

interface QuickAction {
  label: string
  value: string
  icon?: string
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
  summarization?: SummarizationSettings
  quickActions?: QuickAction[]
}

interface AppSettings {
  themeId: string
  hotkeys: HotkeyConfig
  moveStepPx: number
  windowOpacity: number
  transcription: TranscriptionSettings
  llm: LLMSettings
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
      toggleMeeting: 'Alt+M',
    },
    moveStepPx: 50,
    windowOpacity: 0.85,
    transcription: {
      provider: 'local-fast',
      chunkDurationSec: 2,
    },
    llm: {
      apiKey: '',
      defaultModel: 'gpt5-mini',
      temperature: 0.3,
      activeSystemPromptId: null,
      systemPrompts: [],
      summarization: {
        autoSummarizeEnabled: true,
        stalenessMinutes: 5,
        thresholdPercent: 40,
        keepRawCount: 5,
        summarizerSystemPrompt: null,
      },
      quickActions: [],
    },
  },
})

// Migrate: ensure new hotkey defaults exist in stored config
const storedHotkeys = store.get('hotkeys')
if (!storedHotkeys.toggleMeeting) {
  store.set('hotkeys.toggleMeeting' as any, 'Alt+M')
}

// ── Onboarding state (separate store) ────────────────────
const onboardingStore = new Store<{ hasCompletedOnboarding: boolean }>({
  name: 'onboarding',
  defaults: { hasCompletedOnboarding: false },
})

let mainWindow: BrowserWindow | null = null
let isInvisible = true // starts invisible (content protection on)

// ── LLM Service ─────────────────────────────────────────
const llmService = new LLMService(store)

// ── Audio Pipeline ─────────────────────────────────────
const audioPipeline = new AudioPipeline(store.get('transcription'))

// ── Screen Recorder ───────────────────────────────────
const screenRecorder = new ScreenRecorder()

// ── Chrome Extension WebSocket Server ──────────────────
const extensionWsServer = new ExtensionWsServer()

// ── Native Helper Bridge ───────────────────────────────
let nativeBridge: NativeHelperBridge | null = null

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

  // Apply saved window opacity
  mainWindow.setOpacity(store.get('windowOpacity'))

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

  // Connect pipeline, recorder, and LLM service to window
  audioPipeline.setWindow(mainWindow)
  screenRecorder.setWindow(mainWindow)
  llmService.setWindow(mainWindow)

  // Install the default display media handler.
  // The ScreenRecorder swaps this to auto-select the user's chosen source when recording.
  screenRecorder._installDefaultHandler()

  // Load the renderer
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Clear reference when window is closed (prevents "Object has been destroyed" in hotkeys)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

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
        })
      } else if (key === 'llm' && typeof value === 'object') {
        // Deep merge LLM settings (including nested summarization)
        const current = (store.get('llm') || {}) as unknown as Record<string, unknown>
        const incoming = value as unknown as Record<string, unknown>
        const merged: Record<string, unknown> = { ...current }
        for (const [k, v] of Object.entries(incoming)) {
          if (k === 'summarization' && typeof v === 'object' && v !== null) {
            merged[k] = { ...((current.summarization as object) || {}), ...v }
          } else {
            merged[k] = v
          }
        }
        store.set('llm', merged as unknown as LLMSettings)
      } else {
        store.set(key as keyof AppSettings, value as never)
      }
    }

    const newHotkeys = JSON.stringify(store.get('hotkeys'))

    // Re-register hotkeys if hotkeys or moveStepPx changed
    if ((oldHotkeys !== newHotkeys || partial.moveStepPx !== undefined) && mainWindow && !mainWindow.isDestroyed()) {
      reregisterHotkeys(mainWindow, store)
    }

    // Apply window opacity immediately
    if (partial.windowOpacity !== undefined && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(store.get('windowOpacity'))
    }

    // Notify audio pipeline if transcription settings changed
    if (partial.transcription) {
      audioPipeline.onSettingsChanged(store.get('transcription'))
    }

    // Notify renderer that settings changed
    if (mainWindow && !mainWindow.isDestroyed()) {
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

  // ── LLM Service ──────────────────────────────────────
  // The LLM service registers its own IPC handlers for:
  //   llm:chat, llm:cancel, llm:reset, llm:set-model, llm:get-model,
  //   llm:set-api-key, llm:has-api-key, llm:set-temperature
  // and sends streaming responses via:
  //   llm:chat-delta, llm:chat-done, llm:chat-error
  llmService.registerIpcHandlers()

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

  // ── Onboarding ─────────────────────────────────────
  ipcMain.handle('onboarding:get-completed', () => {
    return onboardingStore.get('hasCompletedOnboarding')
  })

  ipcMain.handle('onboarding:set-completed', (_event, completed: boolean) => {
    onboardingStore.set('hasCompletedOnboarding', completed)
    return { success: true }
  })

  // ── Open external URL ──────────────────────────────
  ipcMain.handle('clipboard:write-text', (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('open-external-url', (_event, url: string) => {
    shell.openExternal(url)
    return { success: true }
  })

  // ── App lifecycle ─────────────────────────────────
  ipcMain.on('app-quit', () => {
    app.quit()
  })
}

// ── Chrome Extension WS Server Lifecycle ──────────────
function initExtensionWsServer(): void {
  // Helper: safely send to renderer only if window is alive
  const safeSend = (channel: string, data: unknown): void => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data)
      }
    } catch {
      // Window already destroyed — ignore
    }
  }

  extensionWsServer.on('connected', () => {
    console.log('[extension-ws] Chrome extension connected')
    safeSend('extension:status-changed', { connected: true })
    // Start external recording so video chunks are saved to disk
    screenRecorder.startExternalRecording()
    // Auto-start meeting session when extension connects
    safeSend('extension:auto-start-meeting', {})
  })

  extensionWsServer.on('disconnected', () => {
    console.log('[extension-ws] Chrome extension disconnected')
    safeSend('extension:status-changed', { connected: false })
    // Stop external recording
    screenRecorder.stopExternalRecording()
    // Auto-stop meeting when extension disconnects
    safeSend('extension:auto-stop-meeting', {})
  })

  // Feed audio frames from extension into AudioPipeline as "system" source
  extensionWsServer.on('audioFrame', (pcm: Float32Array, sampleRate: number) => {
    audioPipeline.handleExternalAudioFrame('system', pcm, sampleRate, Date.now())
  })

  // Feed video chunks from extension into ScreenRecorder
  extensionWsServer.on('videoChunk', (data: Buffer) => {
    screenRecorder.writeExternalChunk(data)
  })

  // Forward mic audio from the renderer back to the Chrome extension so the
  // offscreen document can mix it into the WebM recording (WS fallback path).
  ipcMain.on(
    'meeting:audio-frame',
    (
      _event: Electron.IpcMainEvent,
      payload: { source: string; pcm: ArrayBuffer; sampleRate: number; timestamp: number },
    ) => {
      if (payload.source === 'mic' && extensionWsServer.isClientConnected) {
        const pcm = new Float32Array(payload.pcm)
        if (pcm.length > 0) {
          extensionWsServer.sendMicAudio(pcm)
        }
      }
    },
  )

  extensionWsServer.on('error', (err: Error) => {
    console.error('[extension-ws] Error:', err)
  })

  // IPC handler so renderer can query extension connection status
  ipcMain.handle('extension:get-status', () => {
    return { connected: extensionWsServer.isClientConnected }
  })

  // IPC handler to tell the extension to stop capturing.
  // Uses stopCaptureClient() which also closes the socket from our side
  // to guarantee the 'disconnected' event fires even if the client is slow.
  ipcMain.handle('extension:stop-capture', () => {
    extensionWsServer.stopCaptureClient()
    return { success: true }
  })

  extensionWsServer.start()
}

// ── Native Helper Bridge Lifecycle ─────────────────────
async function initNativeBridge(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.log('[native-bridge] Skipping — not on macOS')
    return
  }

  nativeBridge = new NativeHelperBridge()

  // Helper: safely send to renderer only if window is alive
  const safeSend = (channel: string, data: unknown): void => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data)
      }
    } catch {
      // Window already destroyed — ignore
    }
  }

  // Forward native bridge events to renderer
  nativeBridge.on('connected', () => {
    console.log('[native-bridge] Connected to NativeHelper')
    safeSend('native:status-changed', {
      available: true,
      ...nativeBridge!.status,
    })
  })

  nativeBridge.on('disconnected', () => {
    console.log('[native-bridge] Disconnected from NativeHelper')
    safeSend('native:status-changed', {
      available: false,
      connected: false,
      processRunning: false,
      captureState: 'idle',
      micActive: false,
      systemAudioActive: false,
    })
  })

  nativeBridge.on('status', () => {
    safeSend('native:status-changed', {
      available: true,
      ...nativeBridge!.status,
    })
  })

  nativeBridge.on('error', (err) => {
    console.error('[native-bridge] Error:', err)
    safeSend('native:error', err)
  })

  // Connect to the audio pipeline
  audioPipeline.setNativeBridge(nativeBridge)

  // Start the native helper process
  try {
    await nativeBridge.start()
    console.log('[native-bridge] ✓ NativeHelper started and connected — native audio capture AVAILABLE')
    console.log('[native-bridge]   Status:', JSON.stringify(nativeBridge.status))
  } catch (err) {
    console.warn('[native-bridge] ✗ Failed to start NativeHelper — falling back to browser-only capture')
    console.warn('[native-bridge]   Error:', err)
    console.warn('[native-bridge]   Build it with: cd desktop && npm run build:native')
  }
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

  // Start Chrome extension WebSocket server
  initExtensionWsServer()

  // Start native helper bridge (non-blocking — falls back to browser capture on failure)
  initNativeBridge()

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

app.on('before-quit', () => {
  // Null out mainWindow early so async callbacks don't touch a destroyed object
  mainWindow = null
})

app.on('will-quit', async (e) => {
  unregisterAllHotkeys()
  extensionWsServer.stop()
  audioPipeline.destroy()
  llmService.destroy()

  // Flush Langfuse traces before exit (Electron is short-lived)
  await flushLangfuse()

  if (nativeBridge) {
    const bridge = nativeBridge
    nativeBridge = null // prevent re-entry

    e.preventDefault()

    // Give the bridge 2s to stop gracefully, then force quit
    const forceQuitTimer = setTimeout(() => {
      console.log('[app] Force quitting (native bridge stop timed out)')
      app.exit(0)
    }, 2000)

    bridge
      .stop()
      .catch(() => {})
      .finally(() => {
        clearTimeout(forceQuitTimer)
        app.exit(0)
      })
  }
})
