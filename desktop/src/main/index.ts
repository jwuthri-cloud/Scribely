import './load-env' // .env from disk before Langfuse / other main code
import './instrumentation' // Must be first after env — Langfuse observability

import { createLogger, silenceLoggers } from './logger'

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
import { unloadQuestionClassifier } from './insights/question-classifier'
import { unloadEmbeddingService } from './insights/embedding-service'
import { flushLangfuse } from './instrumentation'
import { AuthService } from './auth/auth-service'
import { BackendClient, type MeetingSyncPayload } from './backend-client'
import { resolveCalendarEventIdForTranscript } from './calendar-meeting-match'
import { resolveCaptureProvider } from './recall/entitlement'
import { UploadQueueService } from './upload-queue'
import { migrateLegacyOpenAIModelId } from '../shared/openai-models'
import { checkForUpdatesNow, registerUpdaterIpc, startAutoUpdater } from './updater'

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

interface TranscriptionSettings {
  mode?: 'local' | 'cloud'
  localModel?: 'fast' | 'balanced' | 'accurate'
  cloudProvider?: string
  cloudModel?: string
  language?: 'en' | 'multi'
  provider?: string // legacy
  chunkDurationSec?: number
  apiKeys?: { deepgram?: string; assemblyai?: string; gladia?: string; revai?: string }
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
      focusChatInput: 'Alt+Enter',
    },
    moveStepPx: 50,
    windowOpacity: 0.85,
    transcription: {
      mode: 'local',
      localModel: 'fast',
      cloudProvider: 'deepgram',
      cloudModel: 'nova-3',
      language: 'en',
      chunkDurationSec: 2,
      apiKeys: {},
    },
    llm: {
      apiKey: '',
      defaultModel: 'gpt-5-mini',
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

// Migrate: legacy OpenAI model ids (gpt-5.4-*) → gpt-5-nano / gpt-5-mini / gpt-5.2
const storedLlmForModel = store.get('llm') as { defaultModel?: string } | undefined
if (storedLlmForModel?.defaultModel) {
  const migratedModel = migrateLegacyOpenAIModelId(storedLlmForModel.defaultModel)
  if (migratedModel !== storedLlmForModel.defaultModel) {
    store.set('llm.defaultModel' as any, migratedModel)
  }
}

// Migrate: ensure new hotkey defaults exist in stored config
const storedHotkeys = store.get('hotkeys')
if (!storedHotkeys.toggleMeeting) {
  store.set('hotkeys.toggleMeeting' as any, 'Alt+M')
}
if (!storedHotkeys.focusChatInput) {
  store.set('hotkeys.focusChatInput' as any, 'Alt+Enter')
}

// Migrate: transcription from legacy (provider) to new (mode, localModel, cloudProvider)
const storedTranscription = store.get('transcription') as TranscriptionSettings
if (storedTranscription && 'provider' in storedTranscription && !('mode' in storedTranscription)) {
  const p = (storedTranscription as { provider: string }).provider
  const migrated: TranscriptionSettings = {
    mode: p.startsWith('local-') ? 'local' : 'cloud',
    localModel: p.startsWith('local-') ? (p.replace('local-', '') as 'fast' | 'balanced' | 'accurate') : undefined,
    cloudProvider: !p.startsWith('local-') ? p : undefined,
    cloudModel: p === 'deepgram' ? 'nova-3' : undefined,
    language: 'en',
    chunkDurationSec: storedTranscription.chunkDurationSec ?? 2,
    apiKeys: storedTranscription.apiKeys ?? {},
  }
  store.set('transcription', migrated)
}

// ── Onboarding state (separate store) ────────────────────
const onboardingStore = new Store<{ hasCompletedOnboarding: boolean }>({
  name: 'onboarding',
  defaults: { hasCompletedOnboarding: false },
})

let mainWindow: BrowserWindow | null = null
let isInvisible = true // starts invisible (content protection on)
let tray: Tray | null = null
let isMeetingActive = false

// ── LLM Service ─────────────────────────────────────────
const llmService = new LLMService(store)

// ── Auth Service ─────────────────────────────────────────
const authService = new AuthService()

// ── Backend Client ───────────────────────────────────────
const backendClient = new BackendClient(authService)

// ── Upload Queue ─────────────────────────────────────────
const uploadQueueService = new UploadQueueService(backendClient, authService)

// Fetch the per-user Recall entitlement from the backend and resolve which capture
// provider to use (recall vs base). Phase 0: logs the decision; Phase 2 acts on it.
async function refreshRecallDecision(): Promise<void> {
  if (!backendClient.isConfigured) {
    resolveCaptureProvider(false)
    return
  }
  const status = await backendClient.validateAuth()
  resolveCaptureProvider(status.authenticated && status.useRecallSdk)
}

// ── Live Insights Engine ───────────────────────────────
function getInsightsConfig() {
  const llm = store.get('llm') as { insights?: { enabled?: boolean; enrichmentEnabled?: boolean }; provider?: string } | undefined
  const insights = llm?.insights ?? {}
  return {
    enabled: insights.enabled !== false,
    enrichmentEnabled: insights.enrichmentEnabled !== false,
    webSearchAvailable: llm?.provider === 'openai',
  }
}

const insightEngine = new InsightEngine({
  sendToRenderer: (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  },
  validate: async (event, transcriptContext) => {
    const config = getInsightsConfig()
    if (!config.enabled) return null
    return llmService.validateQuestion(transcriptContext, event.text, event.speaker)
  },
  validateInsights: async (transcriptDelta, entry, triggeredTypes, previousTopic) => {
    const config = getInsightsConfig()
    if (!config.enabled) return null
    return llmService.validateInsights(transcriptDelta, entry, triggeredTypes, previousTopic)
  },
  generateSegmentTopic: async (entries) => {
    const config = getInsightsConfig()
    if (!config.enabled) return 'N/A'
    return llmService.generateSegmentTopic(entries)
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
    let suggestedActions = result.suggestedActions?.map((a) => ({
      id: crypto.randomUUID(),
      label: a.label,
      type: a.type as import('./insights/types').InsightActionType,
      payload: a.payload,
      icon: a.icon,
    }))
    if (!config.webSearchAvailable && suggestedActions) {
      suggestedActions = suggestedActions.filter((a) => a.type !== 'search')
    }
    return {
      title: result.title,
      description: result.description,
      suggestedActions,
    }
  },
  enrichmentEnabled: getInsightsConfig().enrichmentEnabled,
  webSearchAvailable: () => getInsightsConfig().webSearchAvailable,
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

// ── Ignore EIO write errors during shutdown ─────────────
// Consola (and other loggers) may try to write to stdout/stderr after they're
// closed, causing "write EIO". Harmless during quit — suppress to avoid crash.
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EIO' && err.message?.includes('write')) {
    return // Ignore — we're shutting down
  }
  throw err
})

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

// ── Custom URL scheme (scribely://) for Chrome extension launch ──
// Must be registered before app.ready. Only works when app is packaged.
if (!process.defaultApp) {
  app.setAsDefaultProtocolClient('scribely')
}
function parseScribelyMeetingUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'scribely:') return null
    if (u.hostname !== 'meeting') return null
    const target = u.searchParams.get('url')
    if (!target) return null
    return decodeURIComponent(target)
  } catch {
    return null
  }
}

app.on('open-url', (_event, url) => {
  if (url.startsWith('scribely://')) {
    appLog.info('Launched via scribely:// URL:', url)

    if (authService.handleOpenUrl(url)) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
      return
    }

    const meetUrl = parseScribelyMeetingUrl(url)
    if (meetUrl) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
      void shell.openExternal(meetUrl)
      return
    }
  }
})

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

  // Connect pipeline, recorder, LLM service, and auth service to window
  audioPipeline.setWindow(mainWindow)
  screenRecorder.setWindow(mainWindow)
  llmService.setWindow(mainWindow)
  authService.setWindow(mainWindow)

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
    authService.setWindow(null)
    mainWindow = null
  })

  mainWindow.on('show', rebuildTrayMenu)
  mainWindow.on('hide', rebuildTrayMenu)

  // Register all global hotkeys (store type assertion for cross-module AppSettings compatibility)
  registerAllHotkeys(mainWindow, store as Parameters<typeof registerAllHotkeys>[1])
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
        // Deep merge transcription settings (including apiKeys)
        const current = store.get('transcription')
        const incoming = value as Partial<TranscriptionSettings>
        const merged: Record<string, unknown> = { ...current, ...incoming }
        if (incoming.apiKeys && typeof incoming.apiKeys === 'object') {
          merged.apiKeys = { ...(current?.apiKeys || {}), ...incoming.apiKeys }
        }
        store.set('transcription', merged)
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
      reregisterHotkeys(mainWindow, store as Parameters<typeof reregisterHotkeys>[1])
    }

    // Apply window opacity immediately
    if (partial.windowOpacity !== undefined && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(store.get('windowOpacity'))
    }

    // Notify audio pipeline if transcription settings changed
    if (partial.transcription) {
      audioPipeline.onSettingsChanged(store.get('transcription'))
    }

    // Update insight engine when transcription language or llm.insights changed
    const transcription = store.get('transcription') as { language?: 'en' | 'multi' } | undefined
    const transcriptionLanguage = transcription?.language ?? 'en'

    if (partial.transcription) {
      insightEngine.updateSettings({
        transcriptionLanguage,
      })
    }

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
        speakerFilter: (insights.speakerFilter as 'you' | 'them' | 'both') || 'both',
        enrichmentEnabled: insights.enrichmentEnabled !== false,
        transcriptionLanguage,
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

  // Used by onboarding (Step 4) to reflect macOS Privacy settings
  ipcMain.handle('check-screen-recording-permission', async () => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.getMediaAccessStatus('screen') === 'granted'
  })

  ipcMain.handle('check-accessibility-permission', async () => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.isTrustedAccessibilityClient(false)
  })

  // ── Insights (panel now embedded in main window; keep send-to-chat for compatibility) ──
  ipcMain.handle('insights:toggle-window', () => {
    // No-op: insights panel is now embedded in main overlay
  })

  ipcMain.handle('insights:window-visible', () => false)

  ipcMain.handle('insights:close-window', () => {
    // No-op: insights panel is now embedded in main overlay
  })

  ipcMain.handle('insights:send-to-chat', (_event, text: string) => {
    if (mainWindow && !mainWindow.isDestroyed() && typeof text === 'string') {
      mainWindow.webContents.send('chat:message-from-insights', text)
    }
  })

  // ── Auth Service ────────────────────────────────────
  authService.registerIpcHandlers()

  // ── Backend Client / Upload Queue ──────────────────
  ipcMain.handle('backend:sync-meeting', async (_event, payload: MeetingSyncPayload) => {
    if (!backendClient.isConfigured) {
      return { success: false, message: 'BACKEND_API_URL not configured' }
    }
    let toQueue = payload
    if (!payload.calendarEventId && payload.transcriptFilepath) {
      const authState = authService.getState()
      if (authState.mode === 'authenticated' && authService.getSessionToken()) {
        const calId = await resolveCalendarEventIdForTranscript(backendClient, payload.transcriptFilepath)
        if (calId) {
          toQueue = { ...payload, calendarEventId: calId }
          appLog.info(`Auto-linked calendar event ${calId} for meeting upload`)
        }
      }
    }
    const queueId = uploadQueueService.enqueue(toQueue)
    return { success: true, message: 'Queued for upload', queueId }
  })

  ipcMain.handle('backend:validate-auth', async () => {
    if (!backendClient.isConfigured) {
      return { authenticated: false }
    }
    return backendClient.validateAuth()
  })

  // ── Upload Queue IPC ────────────────────────────────
  ipcMain.handle('upload-queue:get-history', () => {
    return uploadQueueService.getHistory()
  })

  ipcMain.handle('upload-queue:retry-item', (_event, id: string) => {
    return uploadQueueService.retryItem(id)
  })

  ipcMain.handle('upload-queue:clear-item', (_event, id: string) => {
    uploadQueueService.clearItem(id)
  })

  ipcMain.handle('upload-queue:clear-all', () => {
    uploadQueueService.clearAll()
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

  registerUpdaterIpc()
}

// ── Chrome Extension WS Server Lifecycle ──────────────
function initExtensionWsServer(): void {
  /**
   * When the renderer stops the meeting it calls `extension:stop-capture`, which
   * closes the WebSocket. That emits `disconnected` — we must NOT also send
   * `extension:auto-stop-meeting`, or the renderer runs handleStopMeeting twice
   * (duplicate transcript save + duplicate backend upload).
   */
  let suppressAutoStopOnExtensionDisconnect = false

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

  extensionWsServer.on('connected', async () => {
    suppressAutoStopOnExtensionDisconnect = false
    extensionWsLog.success('Chrome extension connected')
    safeSend('extension:status-changed', { connected: true })
    // Start pipeline immediately so we don't drop extension audio frames
    // (renderer's handleStartMeeting is async and may lag)
    await audioPipeline.startSessionIfNeeded()
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
    // Auto-stop meeting when extension disconnects unexpectedly (e.g. tab closed).
    // Skip when the disconnect was caused by renderer `extension:stop-capture` (user stopped meeting).
    if (suppressAutoStopOnExtensionDisconnect) {
      suppressAutoStopOnExtensionDisconnect = false
      extensionWsLog.debug('Skipping auto-stop-meeting (extension stop was renderer-initiated)')
    } else {
      safeSend('extension:auto-stop-meeting', {})
    }
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
  // Stops the external recording first (so we have the filepath) then closes
  // the socket. The 'disconnected' handler may call stopExternalRecording
  // again — that is safe (it returns the stored filepath when already stopped).
  ipcMain.handle('extension:stop-capture', async () => {
    suppressAutoStopOnExtensionDisconnect = true
    const { filepath } = await screenRecorder.stopExternalRecording()
    extensionWsServer.stopCaptureClient()
    return { success: true, filepath: filepath ?? undefined }
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
    ...(app.isPackaged && process.env.SCRIBELY_DISABLE_AUTO_UPDATE !== '1'
      ? [
          { type: 'separator' as const },
          {
            label: 'Check for Updates…',
            click: () => {
              void checkForUpdatesNow()
            },
          },
        ]
      : []),
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
  audioPipeline.setOnSessionStart((sessionId) => {
    llmService.setMeetingSessionId(sessionId)
    isMeetingActive = true
    rebuildTrayMenu()
  })
  audioPipeline.setOnSessionStop(async () => {
    llmService.setMeetingSessionId(null)
    insightEngine.reset()
    llmService.resetInsightsValidation()
    await unloadQuestionClassifier()
    unloadEmbeddingService()
    isMeetingActive = false
    rebuildTrayMenu()
  })

  // Apply initial insights detector config from store
  const initialTranscription = store.get('transcription') as { language?: 'en' | 'multi' } | undefined
  const initialTranscriptionLanguage = initialTranscription?.language ?? 'en'
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
    speakerFilter: (initialInsights.speakerFilter as 'you' | 'them' | 'both') || 'both',
    enrichmentEnabled: initialInsights.enrichmentEnabled !== false,
    transcriptionLanguage: initialTranscriptionLanguage,
  })

  // Start Chrome extension WebSocket server
  initExtensionWsServer()

  // Start native helper bridge (non-blocking — falls back to browser capture on failure)
  if (!process.env.SCRIBELY_SKIP_NATIVE) {
    initNativeBridge()
  } else {
    nativeBridgeLog.info('Skipping native bridge — SCRIBELY_SKIP_NATIVE is set')
  }

  createWindow()
  createTray()
  startAutoUpdater(() => mainWindow)

  // When user signs in, flush any pending uploads (fresh token available)
  authService.setOnSignedIn(() => {
    uploadQueueService.flushPending()
    void refreshRecallDecision()
  })

  // Forward upload queue state changes to renderer
  uploadQueueService.on('changed', (items) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('upload-queue:changed', items)
    }
  })

  // Token expired (401) — notify renderer so user can re-sign in
  uploadQueueService.on('token-expired', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:token-expired')
    }
  })

  // Flush any uploads that failed during a previous session (5s delay to let
  // the renderer load and the auth session token to be read from disk).
  setTimeout(() => {
    uploadQueueService.flushPending()
    void refreshRecallDecision()
  }, 5000)

  // Retry pending uploads every 5 minutes (covers network reconnects and
  // token refresh scenarios without needing a platform-specific online event).
  setInterval(() => {
    uploadQueueService.flushPending()
  }, 5 * 60 * 1000)

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
  // Silence logging to avoid EIO when stdout/stderr close during shutdown
  silenceLoggers()
  // Null out windows early so async callbacks don't touch destroyed objects
  mainWindow = null
})

app.on('will-quit', async (e) => {
  unregisterAllHotkeys()
  extensionWsServer.stop()
  audioPipeline.destroy()
  llmService.destroy()
  authService.destroy()

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
