import './instrumentation' // Must be first — Langfuse observability

import { createLogger } from './logger'

const permissionsLog = createLogger('permissions')
const extensionWsLog = createLogger('extension-ws')
const nativeBridgeLog = createLogger('native-bridge')
const appLog = createLogger('app')

import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  session,
  systemPreferences,
  Tray,
} from 'electron'
import { existsSync } from 'fs'
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
import { InsightEngine } from './insights/insight-engine'
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

interface InsightsSettings {
  enabled?: boolean
  enrichmentEnabled?: boolean
  detectQuestions?: boolean
  detectTopicChanges?: boolean
  detectActionItems?: boolean
  detectKeyMentions?: boolean
  extraQuestionWords?: string[]
  extraQuestionVerbs?: string[]
  questionMlEnabled?: boolean
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
  insights?: InsightsSettings
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
      insights: {
        enabled: true,
        enrichmentEnabled: true,
        detectQuestions: true,
        detectTopicChanges: true,
        detectActionItems: true,
        detectKeyMentions: true,
        extraQuestionWords: [],
        extraQuestionVerbs: [],
        questionMlEnabled: true,
      },
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
let insightsWindow: BrowserWindow | null = null
let isInvisible = true // starts invisible (content protection on)
let tray: Tray | null = null
let isMeetingActive = false

// ── LLM Service ─────────────────────────────────────────
const llmService = new LLMService(store)

// ── Live Insights Engine ───────────────────────────────
function getInsightsConfig() {
  const llm = store.get('llm') as { insights?: { enabled?: boolean; enrichmentEnabled?: boolean } } | undefined
  const insights = llm?.insights ?? {}
  return {
    enabled: insights.enabled !== false,
    enrichmentEnabled: insights.enrichmentEnabled !== false,
  }
}

const insightEngine = new InsightEngine({
  sendToRenderer: (channel, data) => {
    if (insightsWindow && !insightsWindow.isDestroyed()) {
      insightsWindow.webContents.send(channel, data)
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  },
  validate: async (event, transcriptContext) => {
    const config = getInsightsConfig()
    if (!config.enabled) return null
    return llmService.validateQuestion(transcriptContext, event.text, event.speaker)
  },
  validateInsights: async (transcriptDelta, entry, triggeredTypes) => {
    const config = getInsightsConfig()
    if (!config.enabled) return null
    return llmService.validateInsights(transcriptDelta, entry, triggeredTypes)
  },
  enrich: async (event) => {
    const config = getInsightsConfig()
    if (!config.enrichmentEnabled) return null
    const result = await llmService.enrichForInsight(
      event.type,
      event.text,
      event.speaker,
    )
    if (!result) return null
    return {
      title: result.title,
      description: result.description,
      suggestedActions: result.suggestedActions?.map((a) => ({
        id: crypto.randomUUID(),
        label: a.label,
        type: a.type as import('./insights/types').InsightActionType,
        payload: a.payload,
        icon: a.icon,
      })),
    }
  },
  enrichmentEnabled: getInsightsConfig().enrichmentEnabled,
  debounceMs: 10_000,
})

// ── Audio Pipeline ─────────────────────────────────────
const audioPipeline = new AudioPipeline(store.get('transcription'))

// ── Screen Recorder ───────────────────────────────────
const screenRecorder = new ScreenRecorder()

// ── Chrome Extension WebSocket Server ──────────────────
const extensionWsServer = new ExtensionWsServer()

// ── Native Helper Bridge ───────────────────────────────
let nativeBridge: NativeHelperBridge | null = null

// ── Suppress "Chromium Safe Storage" keychain prompt ───
// Electron uses the system keychain to store its own encryption key, which
// triggers a macOS permission dialog on every launch. Using 'basic' avoids
// the keychain entirely for Chromium's internal password store.
// Our API key is still encrypted via Electron's safeStorage (separate from this).
app.commandLine.appendSwitch('password-store', 'basic')

// ── Chromium flags for macOS audio loopback ────────────
// These must be set before app.ready(). They enable system audio capture
// even when output goes through Bluetooth (AirPods) or other non-default routes.
// MacSckSystemAudioLoopbackOverride = ScreenCaptureKit path (macOS 13+)
// MacCatapSystemAudioLoopbackCapture = Core Audio path (fallback when SCK fails)
app.commandLine.appendSwitch(
  'enable-features',
  [
    'MacLoopbackAudioForScreenShare',
    'MacSckSystemAudioLoopbackOverride',
    'MacCatapSystemAudioLoopbackCapture',
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
    permissionsLog.info(`Permission request: ${permission} → ${allowed.includes(permission) ? 'granted' : 'denied'}`)
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

  mainWindow.on('show', rebuildTrayMenu)
  mainWindow.on('hide', rebuildTrayMenu)

  // Register all global hotkeys
  registerAllHotkeys(mainWindow, store)
}

function createInsightsWindow(): void {
  if (insightsWindow && !insightsWindow.isDestroyed()) {
    insightsWindow.focus()
    return
  }

  insightsWindow = new BrowserWindow({
    width: 340,
    height: 500,
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

  insightsWindow.setOpacity(store.get('windowOpacity'))
  applyInvisibility(insightsWindow)
  insightsWindow.setContentProtection(isInvisible)

  insightsWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    insightsWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?view=insights')
  } else {
    insightsWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { view: 'insights' },
    })
  }

  insightsWindow.on('closed', () => {
    insightsWindow = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('insights:window-changed', false)
    }
  })

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('insights:window-changed', true)
  }
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
        // Deep merge LLM settings (including nested summarization, insights)
        const current = (store.get('llm') || {}) as unknown as Record<string, unknown>
        const incoming = value as unknown as Record<string, unknown>
        const merged: Record<string, unknown> = { ...current }
        for (const [k, v] of Object.entries(incoming)) {
          if (k === 'summarization' && typeof v === 'object' && v !== null) {
            merged[k] = { ...((current.summarization as object) || {}), ...v }
          } else if (k === 'insights' && typeof v === 'object' && v !== null) {
            merged[k] = { ...((current.insights as object) || {}), ...v }
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

    // Update insight engine detector config when llm.insights changed
    if (partial.llm && typeof partial.llm === 'object' && 'insights' in partial.llm) {
      const insights = (store.get('llm') as { insights?: Record<string, unknown> })?.insights ?? {}
      const disabled = new Set<import('./insights/types').DetectedEventType>()
      if (insights.detectQuestions === false) disabled.add('question')
      if (insights.detectTopicChanges === false) disabled.add('topic_change')
      if (insights.detectActionItems === false) disabled.add('action_item')
      if (insights.detectKeyMentions === false) disabled.add('key_mention')
      insightEngine.updateSettings({
        disabledTypes: disabled,
        extraQuestionWords: Array.isArray(insights.extraQuestionWords)
          ? insights.extraQuestionWords.filter((k): k is string => typeof k === 'string')
          : [],
        extraQuestionVerbs: Array.isArray(insights.extraQuestionVerbs)
          ? insights.extraQuestionVerbs.filter((k): k is string => typeof k === 'string')
          : [],
        questionMlEnabled: insights.questionMlEnabled !== false,
      })
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

  // ── Insights window ─────────────────────────────────
  ipcMain.handle('insights:toggle-window', () => {
    if (insightsWindow && !insightsWindow.isDestroyed()) {
      insightsWindow.close()
    } else {
      createInsightsWindow()
    }
  })

  ipcMain.handle('insights:window-visible', () => {
    return !!(insightsWindow && !insightsWindow.isDestroyed())
  })

  ipcMain.handle('insights:close-window', () => {
    if (insightsWindow && !insightsWindow.isDestroyed()) {
      insightsWindow.close()
    }
  })

  ipcMain.handle('insights:send-to-chat', (_event, text: string) => {
    if (mainWindow && !mainWindow.isDestroyed() && typeof text === 'string') {
      mainWindow.webContents.send('chat:message-from-insights', text)
    }
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
    if (insightsWindow && !insightsWindow.isDestroyed()) {
      insightsWindow.setContentProtection(isInvisible)
    }
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

  // ── Window resize (compact mode) ───────────────────
  ipcMain.on('set-window-size', (_event, { width, height }: { width: number; height: number }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setSize(width, height, true) // true = animate
    }
  })

  // ── Window hide/show (blue button) ─────────────────
  ipcMain.handle('toggle-window-visibility', () => {
    const win = mainWindow
    if (!win || win.isDestroyed()) return
    if (win.isVisible()) {
      win.webContents.send('toggle-visibility', false)
      setTimeout(() => {
        if (!win.isDestroyed()) win.hide()
      }, 200)
    } else {
      win.show()
      win.webContents.send('toggle-visibility', true)
    }
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
    extensionWsLog.success('Chrome extension connected')
    safeSend('extension:status-changed', { connected: true })
    // Start pipeline immediately so we don't drop extension audio frames
    // (renderer's handleStartMeeting is async and may lag)
    audioPipeline.startSessionIfNeeded()
    // Start external recording so video chunks are saved to disk
    screenRecorder.startExternalRecording()
    // Tell renderer to start meeting UI (mic capture, etc.)
    safeSend('extension:auto-start-meeting', {})
  })

  extensionWsServer.on('disconnected', () => {
    extensionWsLog.info('Chrome extension disconnected')
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
      if (
        payload.source === 'mic' &&
        extensionWsServer.isClientConnected &&
        !audioPipeline.getExcludeMyMic()
      ) {
        const pcm = new Float32Array(payload.pcm)
        if (pcm.length > 0) {
          extensionWsServer.sendMicAudio(pcm)
        }
      }
    },
  )

  ipcMain.on('meeting:set-exclude-mic', (_event, value: boolean) => {
    audioPipeline.setExcludeMyMic(value)
  })

  extensionWsServer.on('error', (err: Error) => {
    extensionWsLog.error(err)
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
    nativeBridgeLog.info('Skipping — not on macOS')
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
    safeSend('native:status-changed', {
      available: true,
      ...nativeBridge!.status,
    })
  })

  nativeBridge.on('disconnected', () => {
    nativeBridgeLog.info('Disconnected from NativeHelper')
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
    nativeBridgeLog.error(err)
    safeSend('native:error', err)
  })

  // Connect to the audio pipeline
  audioPipeline.setNativeBridge(nativeBridge)

  // Start the native helper process
  try {
    await nativeBridge.start()
    nativeBridgeLog.success('NativeHelper started and connected — native audio capture AVAILABLE')
    nativeBridgeLog.debug('Status:', nativeBridge.status)
  } catch (err) {
    nativeBridgeLog.warn('Failed to start NativeHelper — falling back to browser-only capture')
    nativeBridgeLog.warn('Error:', err)
    nativeBridgeLog.warn('Build it with: cd desktop && npm run build:native')
  }
}

// ── Tray (macOS menu bar icon) ──────────────────────────
function toggleOverlayVisibility(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isVisible()) {
    mainWindow.webContents.send('toggle-visibility', false)
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
    }, 200)
  } else {
    mainWindow.show()
    mainWindow.webContents.send('toggle-visibility', true)
  }
}

function rebuildTrayMenu(): void {
  if (!tray) return
  const settings = store.store as { hotkeys?: HotkeyConfig }
  const hk = settings.hotkeys

  const isVisible = mainWindow ? mainWindow.isVisible() : false

  const menu = Menu.buildFromTemplate([
    {
      label: isVisible ? 'Hide Overlay' : 'Show Overlay',
      accelerator: hk?.toggleOverlay || 'Alt+T',
      click: toggleOverlayVisibility,
    },
    {
      label: isMeetingActive ? 'Stop Meeting' : 'Start Meeting',
      accelerator: hk?.toggleMeeting || 'Alt+M',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.webContents.send('toggle-meeting')
      },
    },
    {
      label: 'Reset Chat',
      accelerator: hk?.resetChat || 'Alt+R',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.webContents.send('reset-chat')
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Scribely',
      accelerator: 'CmdOrCtrl+Q',
      click: () => app.quit(),
    },
  ])
  tray.setContextMenu(menu)
}

function createTray(): void {
  const devPath = join(app.getAppPath(), 'resources', 'trayIcon.png')
  const prodPath = join(process.resourcesPath, 'trayIcon.png')
  const iconPath = existsSync(prodPath) ? prodPath : devPath
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.resize({ width: 18, height: 18 }))
  tray.setToolTip('Scribely')
  tray.on('click', toggleOverlayVisibility)
  rebuildTrayMenu()
}

// Hide the dock icon on macOS so the overlay is truly minimal
app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.dock.hide()

    // Request microphone permission — triggers the macOS permission dialog
    // on first run so getUserMedia won't fail with "access denied" later.
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus !== 'granted') {
      permissionsLog.info(`Microphone status: ${micStatus} — requesting access…`)
      const granted = await systemPreferences.askForMediaAccess('microphone')
      if (granted) permissionsLog.success('Microphone access granted')
      else permissionsLog.warn('Microphone access denied')
    }

    // Screen recording permission is handled by the system picker
    // (useSystemPicker: true) — macOS shows the permission flow automatically.
    const screenStatus = systemPreferences.getMediaAccessStatus('screen')
    permissionsLog.info(`Screen recording status: ${screenStatus}`)
  }

  registerIpcHandlers()

  // Initialize audio pipeline (registers its own IPC handlers)
  audioPipeline.registerIpcHandlers()
  await audioPipeline.init()

  // Wire Live Insights to pipeline
  audioPipeline.setOnTranscriptEntry((entry) => {
    const config = getInsightsConfig()
    if (!config.enabled) {
      appLog.debug('Insights disabled — skipping entry')
      return
    }
    insightEngine.onTranscriptEntry(entry)
  })
  audioPipeline.setOnSessionStart(() => {
    isMeetingActive = true
    rebuildTrayMenu()
  })
  audioPipeline.setOnSessionStop(() => {
    insightEngine.reset()
    llmService.resetInsightsValidation()
    isMeetingActive = false
    rebuildTrayMenu()
  })

  // Apply initial insights detector config from store
  const initialInsights = (store.get('llm') as { insights?: Record<string, unknown> })?.insights ?? {}
  const initialDisabled = new Set<import('./insights/types').DetectedEventType>()
  if (initialInsights.detectQuestions === false) initialDisabled.add('question')
  if (initialInsights.detectTopicChanges === false) initialDisabled.add('topic_change')
  if (initialInsights.detectActionItems === false) initialDisabled.add('action_item')
  if (initialInsights.detectKeyMentions === false) initialDisabled.add('key_mention')
  insightEngine.updateSettings({
    disabledTypes: initialDisabled,
    extraQuestionWords: Array.isArray(initialInsights.extraQuestionWords)
      ? initialInsights.extraQuestionWords.filter((k): k is string => typeof k === 'string')
      : [],
    extraQuestionVerbs: Array.isArray(initialInsights.extraQuestionVerbs)
      ? initialInsights.extraQuestionVerbs.filter((k): k is string => typeof k === 'string')
      : [],
    questionMlEnabled: initialInsights.questionMlEnabled !== false,
  })

  // Start Chrome extension WebSocket server
  initExtensionWsServer()

  // Start native helper bridge (non-blocking — falls back to browser capture on failure)
  initNativeBridge()

  createWindow()
  createTray()

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
  // Null out windows early so async callbacks don't touch destroyed objects
  mainWindow = null
  insightsWindow = null
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
      appLog.warn('Force quitting (native bridge stop timed out)')
      app.exit(0)
    }, 2000)

    bridge
      .stop()
      .catch(() => { })
      .finally(() => {
        clearTimeout(forceQuitTimer)
        app.exit(0)
      })
  }
})
