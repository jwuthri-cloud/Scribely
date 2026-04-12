import { useEffect, useState, useCallback } from 'react'
import { HotkeyRecorder } from './HotkeyRecorder'
import { useTheme } from '../themes/ThemeProvider'
import { themes as themeMap } from '../themes/registry'
import type {
  AppSettings,
  HotkeyConfig,
  TranscriptionSettings,
  LocalModel,
  CloudProvider,
  TranscriptionMode,
  TranscriptionLanguage,
} from '../types'
import type { AuthUser, AuthState } from '../types'
import {
  DEFAULT_HOTKEYS,
  HOTKEY_LABELS,
  DEFAULT_SETTINGS,
  DEFAULT_TRANSCRIPTION,
  FONT_SIZE_LABELS,
  type FontSize,
} from '../types/settings'

export interface SettingsViewProps {
  onReRunSetup?: () => void
}

export function SettingsView({ onReRunSetup }: SettingsViewProps) {
  const { theme, themeIds, setThemeId } = useTheme()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [updaterStatus, setUpdaterStatus] = useState<{
    currentVersion: string
    pendingVersion: string | null
    updatesEnabled: boolean
  } | null>(null)
  const [updateLine, setUpdateLine] = useState('')
  const [updateCheckBusy, setUpdateCheckBusy] = useState(false)

  // Load auth state on mount
  useEffect(() => {
    window.electronAPI?.authGetState?.().then(setAuthState)
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI?.onAuthStateChanged?.((state) => {
      setAuthState(state)
      setSigningIn(false)
    })
    return () => unsub?.()
  }, [])

  const handleSignIn = useCallback(async () => {
    setSigningIn(true)
    const result = await window.electronAPI?.authStartSignIn()
    if (result && !result.success) {
      setSigningIn(false)
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    await window.electronAPI?.authSignOut()
  }, [])

  // Load settings on mount
  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      setSettings(s)
    })
  }, [])

  useEffect(() => {
    window.electronAPI?.updaterGetStatus?.().then(setUpdaterStatus)
  }, [])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onUpdaterChecking) return
    const off = [
      api.onUpdaterChecking(() => setUpdateLine('Checking for updates…')),
      api.onUpdaterUpdateAvailable((info) => setUpdateLine(`Downloading ${info.version}…`)),
      api.onUpdaterUpdateNotAvailable(() => setUpdateLine('You’re on the latest version.')),
      api.onUpdaterError((e) => setUpdateLine(`Update error: ${e.message}`)),
      api.onUpdaterDownloadProgress((p) =>
        setUpdateLine(`Downloading… ${Math.round(p.percent)}%`),
      ),
      api.onUpdaterUpdateDownloaded((info) => {
        setUpdateLine(`Ready to install ${info.version}.`)
        void api.updaterGetStatus?.().then(setUpdaterStatus)
      }),
    ]
    return () => off.forEach((u) => u())
  }, [])

  const handleCheckForUpdates = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.updaterCheck) return
    setUpdateLine('')
    setUpdateCheckBusy(true)
    try {
      const r = await api.updaterCheck()
      if (!r.ok) {
        setUpdateLine(r.error ?? 'Could not check for updates.')
      }
    } finally {
      setUpdateCheckBusy(false)
    }
  }, [])

  // Listen for external settings changes
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onSettingsChanged((s) => {
      setSettings(s)
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      if (!settings) return
      const updated = { ...settings, [key]: value }
      setSettings(updated)
      window.electronAPI?.updateSettings({ [key]: value })
    },
    [settings],
  )

  const updateHotkey = useCallback(
    (key: keyof HotkeyConfig, value: string) => {
      if (!settings) return
      const newHotkeys = { ...settings.hotkeys, [key]: value }
      const updated = { ...settings, hotkeys: newHotkeys }
      setSettings(updated)
      window.electronAPI?.updateSettings({ hotkeys: newHotkeys })
    },
    [settings],
  )

  if (!settings) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Loading settings...
        </span>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
      {/* ── Account ────────────────────────────── */}
      <Section title="Account">
        {authState?.mode === 'authenticated' && authState.user ? (
          <div className="flex items-center gap-3">
            {authState.user.imageUrl ? (
              <img
                src={authState.user.imageUrl}
                alt=""
                className="w-8 h-8 rounded-full shrink-0"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
              >
                {(authState.user.firstName?.[0] || authState.user.email[0] || '?').toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                {authState.user.fullName || authState.user.email}
              </div>
              {authState.user.fullName && (
                <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {authState.user.email}
                </div>
              )}
            </div>
            <button
              onClick={handleSignOut}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors hover:brightness-110"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Not signed in
            </span>
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              {signingIn ? (
                <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              {signingIn ? 'Opening...' : 'Sign in with Google'}
            </button>
          </div>
        )}
      </Section>

      {/* ── App updates ─────────────────────────── */}
      {updaterStatus && (
        <Section title="App updates">
          <div className="space-y-2">
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Version {updaterStatus.currentVersion}
              {updaterStatus.pendingVersion ? (
                <span className="ml-2 font-medium" style={{ color: 'var(--accent)' }}>
                  · Update {updaterStatus.pendingVersion} downloaded
                </span>
              ) : null}
            </div>
            {updaterStatus.updatesEnabled ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCheckForUpdates}
                    disabled={updateCheckBusy}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                  >
                    {updateCheckBusy ? 'Checking…' : 'Check for updates'}
                  </button>
                  {updaterStatus.pendingVersion ? (
                    <button
                      type="button"
                      onClick={() => void window.electronAPI?.updaterQuitAndInstall?.()}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:brightness-110"
                      style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                    >
                      Restart and update
                    </button>
                  ) : null}
                </div>
                {updateLine ? (
                  <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                    {updateLine}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                Automatic updates run in the installed app. Development builds do not receive updates
                from GitHub releases.
              </p>
            )}
          </div>
        </Section>
      )}

      {/* ── Hotkeys ─────────────────────────────── */}
      <Section title="Hotkeys">
        <div className="space-y-2.5">
          {(Object.keys(DEFAULT_HOTKEYS) as (keyof HotkeyConfig)[]).map((key) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text)' }}>
                {HOTKEY_LABELS[key]}
              </span>
              <HotkeyRecorder
                value={settings.hotkeys[key]}
                defaultValue={DEFAULT_HOTKEYS[key]}
                onChange={(acc) => updateHotkey(key, acc)}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* ── Theme ──────────────────────────────── */}
      <Section title="Theme">
        <div className="grid grid-cols-2 gap-2">
          {themeIds.map((id) => {
            const t = themeMap[id]
            if (!t) return null
            const isActive = theme.id === id
            return (
              <button
                key={id}
                onClick={() => {
                  setThemeId(id)
                  updateSetting('themeId', id)
                }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150 border text-left"
                style={{
                  backgroundColor: isActive ? 'var(--accent)' : 'var(--surface)',
                  color: isActive ? '#fff' : 'var(--text)',
                  borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {/* Color swatch preview */}
                <div
                  className="w-5 h-5 rounded-md border shrink-0 grid grid-cols-2 grid-rows-2 overflow-hidden"
                  style={{ borderColor: isActive ? 'rgba(255,255,255,0.3)' : 'var(--border)' }}
                >
                  <div style={{ backgroundColor: t.colors.bg }} />
                  <div style={{ backgroundColor: t.colors.accent }} />
                  <div style={{ backgroundColor: t.colors.surface }} />
                  <div style={{ backgroundColor: t.colors.text, opacity: 0.7 }} />
                </div>
                <span className="truncate">{t.name}</span>
              </button>
            )
          })}
        </div>
      </Section>

      {/* ── Transcription ────────────────────── */}
      <TranscriptionSection
        transcription={settings.transcription || DEFAULT_TRANSCRIPTION}
        onUpdate={(t) => updateSetting('transcription', t)}
      />

      {/* ── Window ─────────────────────────────── */}
      <Section title="Window">
        <div className="space-y-3">
          {/* Font size */}
          <div className="space-y-1">
            <span className="text-xs" style={{ color: 'var(--text)' }}>
              Font size
            </span>
            <div className="flex gap-1.5">
              {(['small', 'medium', 'large'] as FontSize[]).map((size) => {
                const isActive = (settings.fontSize ?? 'medium') === size
                return (
                  <button
                    key={size}
                    onClick={() => updateSetting('fontSize', size)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 border"
                    style={{
                      backgroundColor: isActive ? 'var(--accent)' : 'var(--surface)',
                      color: isActive ? '#fff' : 'var(--text)',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    {FONT_SIZE_LABELS[size]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Opacity */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text)' }}>
                Opacity
              </span>
              <span
                className="text-[11px] font-mono"
                style={{ color: 'var(--text-muted)' }}
              >
                {Math.round(settings.windowOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="30"
              max="100"
              value={Math.round(settings.windowOpacity * 100)}
              onChange={(e) => updateSetting('windowOpacity', Number(e.target.value) / 100)}
              className="w-full accent-[var(--accent)] h-1"
            />
          </div>

          {/* Move step */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text)' }}>
                Move step (px)
              </span>
              <span
                className="text-[11px] font-mono"
                style={{ color: 'var(--text-muted)' }}
              >
                {settings.moveStepPx}px
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="200"
              step="10"
              value={settings.moveStepPx}
              onChange={(e) => updateSetting('moveStepPx', Number(e.target.value))}
              className="w-full accent-[var(--accent)] h-1"
            />
          </div>

          {/* Compact mode */}
          <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--text)' }}>
              Compact mode
            </span>
            <button
              onClick={() => updateSetting('compactMode', !(settings.compactMode ?? false))}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                settings.compactMode ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.compactMode ? 'left-4' : 'left-0.5'
                }`}
              />
            </button>
          </div>
          <p className="text-[10px] pt-0.5" style={{ color: 'var(--text-muted)' }}>
            Fewer UI elements, no transcript panel, no hotkey hints
          </p>
        </div>
      </Section>

      {/* ── Re-run setup / Reset ──────────────────────────── */}
      <div className="pt-2 pb-4 space-y-2">
        {onReRunSetup && (
          <button
            onClick={onReRunSetup}
            className="text-xs transition-colors hover:brightness-125 block"
            style={{ color: 'var(--accent)' }}
          >
            Re-run setup wizard
          </button>
        )}
        <button
          onClick={() => {
            const defaults = { ...DEFAULT_SETTINGS }
            setSettings(defaults)
            window.electronAPI?.updateSettings(defaults)
            setThemeId(defaults.themeId)
          }}
          className="text-xs transition-colors hover:brightness-125 block"
          style={{ color: 'var(--error)' }}
        >
          Reset all settings to defaults
        </button>
      </div>
    </div>
  )
}

// ── Local models ────────────────────────────────────────────
const LOCAL_MODELS: { id: LocalModel; label: string; detail: string }[] = [
  { id: 'fast', label: 'Fast', detail: '~0.5GB' },
  { id: 'balanced', label: 'Balanced', detail: '~1.5GB' },
  { id: 'accurate', label: 'Accurate', detail: '~2GB' },
]

// ── Cloud providers (same large-box style as Local models) ───
const CLOUD_PROVIDERS: { id: CloudProvider; label: string; detail: string }[] = [
  { id: 'deepgram', label: 'Deepgram', detail: 'Nova (cloud)' },
  { id: 'assemblyai', label: 'AssemblyAI', detail: 'Universal (cloud)' },
  { id: 'gladia', label: 'Gladia', detail: 'Solaria (cloud)' },
  { id: 'revai', label: 'Rev.ai', detail: 'Cloud' },
]

// ── Cloud model options (provider → models) ─────────────────
const CLOUD_MODELS: Record<CloudProvider, { id: string; label: string }[]> = {
  deepgram: [
    { id: 'nova-3', label: 'Nova 3' },
    { id: 'nova-2', label: 'Nova 2' },
    { id: 'nova-3-general', label: 'Nova 3 General' },
    { id: 'nova-3-medical', label: 'Nova 3 Medical' },
  ],
  assemblyai: [
    { id: 'universal-2', label: 'Universal 2' },
    { id: 'universal-1', label: 'Universal 1' },
    { id: 'universal-3-pro', label: 'Universal 3 Pro' },
  ],
  gladia: [{ id: 'solaria-1', label: 'Solaria 1' }],
  revai: [],
}

function TranscriptionSection({
  transcription,
  onUpdate,
}: {
  transcription: TranscriptionSettings
  onUpdate: (t: TranscriptionSettings) => void
}) {
  const mode = transcription.mode ?? 'local'
  const localModel = transcription.localModel ?? 'fast'
  const cloudProvider = (transcription.cloudProvider ?? 'deepgram') as CloudProvider
  const language = transcription.language ?? 'en'

  const [modelStatus, setModelStatus] = useState<{
    available: boolean
    downloading: boolean
    progress: number
  } | null>(null)

  // Cloud API key state (per provider)
  const hasCloudKey = !!(transcription.apiKeys?.[cloudProvider]?.trim())
  const [showCloudInput, setShowCloudInput] = useState(!hasCloudKey)
  const [cloudKeyInput, setCloudKeyInput] = useState('')

  // Sync to "configured" view when key exists (settings load, provider switch, or after save)
  // Only runs when hasCloudKey or cloudProvider changes - not when user clicks Change
  useEffect(() => {
    setShowCloudInput(!hasCloudKey)
  }, [hasCloudKey, cloudProvider])

  // Fetch model status when local mode + model/language changes
  useEffect(() => {
    if (mode !== 'local') return
    window.electronAPI?.getModelStatus?.().then((s: any) => {
      setModelStatus(s?.whisperModel || null)
    })
  }, [mode, localModel, language])

  useEffect(() => {
    const unsub = window.electronAPI?.onModelProgress?.((data) => {
      setModelStatus((prev) => ({
        available: prev?.available || false,
        downloading: true,
        progress: Math.max(prev?.progress || 0, data.progress),
      }))
    })
    const unsub2 = window.electronAPI?.onModelComplete?.(() => {
      setModelStatus({ available: true, downloading: false, progress: 100 })
    })
    return () => {
      unsub?.()
      unsub2?.()
    }
  }, [])

  const update = (patch: Partial<TranscriptionSettings>) => {
    onUpdate({ ...transcription, ...patch })
  }

  const setMode = (m: TranscriptionMode) => update({ mode: m })
  const setLocalModel = (m: LocalModel) => update({ localModel: m })
  const setCloudProvider = (p: CloudProvider) =>
    update({ cloudProvider: p, cloudModel: CLOUD_MODELS[p]?.[0]?.id })
  const setCloudModel = (m: string) => update({ cloudModel: m })
  const setLanguage = (l: TranscriptionLanguage) => update({ language: l })

  const cloudModels = CLOUD_MODELS[cloudProvider] ?? []
  const hasCloudModelSelect = cloudModels.length > 1

  return (
    <Section title="Transcription">
      <div className="space-y-3">
        {/* Mode toggle: Local / Cloud */}
        <div className="flex gap-1 rounded-lg p-0.5 border" style={{ borderColor: 'var(--border)' }}>
          {(['local', 'cloud'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all"
              style={{
                backgroundColor: mode === m ? 'var(--accent)' : 'transparent',
                color: mode === m ? '#fff' : 'var(--text-muted)',
              }}
            >
              {m === 'local' ? 'Local' : 'Cloud'}
            </button>
          ))}
        </div>

        {/* Local subsection */}
        {mode === 'local' && (
          <div className="space-y-3 pt-1">
            <div>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Model
              </span>
              <div className="flex gap-1.5 mt-1">
                {LOCAL_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setLocalModel(m.id)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all text-center"
                    style={{
                      backgroundColor: localModel === m.id ? 'var(--accent)' : 'var(--surface)',
                      color: localModel === m.id ? '#fff' : 'var(--text)',
                      borderColor: localModel === m.id ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    <div>{m.label}</div>
                    <div className="text-[9px] opacity-70">{m.detail}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Language
              </span>
              <div className="flex gap-1.5 mt-1">
                {(['en', 'multi'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all"
                    style={{
                      backgroundColor: language === l ? 'var(--accent)' : 'var(--surface)',
                      color: language === l ? '#fff' : 'var(--text)',
                      borderColor: language === l ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    {l === 'en' ? 'English only' : 'Multilingual'}
                  </button>
                ))}
              </div>
            </div>
            {modelStatus && (
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {modelStatus.downloading
                    ? `Downloading... ${modelStatus.progress}%`
                    : modelStatus.available
                      ? 'Model ready'
                      : 'Model not downloaded'}
                </span>
                {modelStatus.downloading && (
                  <div
                    className="w-20 h-1 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--border)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        backgroundColor: 'var(--accent)',
                        width: `${modelStatus.progress}%`,
                      }}
                    />
                  </div>
                )}
                {!modelStatus.downloading && !modelStatus.available && (
                  <button
                    onClick={() => window.electronAPI?.downloadWhisperModel?.()}
                    className="text-[10px] px-2 py-0.5 rounded-md border"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  >
                    Download
                  </button>
                )}
                {modelStatus.available && !modelStatus.downloading && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-md"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--success) 15%, transparent)',
                      color: 'var(--success)',
                    }}
                  >
                    Ready
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Cloud subsection */}
        {mode === 'cloud' && (
          <div className="space-y-3 pt-1">
            <div>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Provider
              </span>
              <div className="flex gap-1.5 mt-1">
                {CLOUD_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setCloudProvider(p.id)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all text-center"
                    style={{
                      backgroundColor: cloudProvider === p.id ? 'var(--accent)' : 'var(--surface)',
                      color: cloudProvider === p.id ? '#fff' : 'var(--text)',
                      borderColor: cloudProvider === p.id ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    <div>{p.label}</div>
                    <div
                      className="text-[9px] mt-0.5 font-normal"
                      style={{
                        opacity: 0.7,
                        color: cloudProvider === p.id ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      {p.detail}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {hasCloudModelSelect && (
              <div>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Model
                </span>
                <select
                  value={transcription.cloudModel ?? cloudModels[0]?.id}
                  onChange={(e) => setCloudModel(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 rounded-lg text-[11px] border bg-transparent"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                  }}
                >
                  {cloudModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Language
              </span>
              <div className="flex gap-1.5 mt-1">
                {(['en', 'multi'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all"
                    style={{
                      backgroundColor: language === l ? 'var(--accent)' : 'var(--surface)',
                      color: language === l ? '#fff' : 'var(--text)',
                      borderColor: language === l ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    {l === 'en' ? 'English only' : 'Multilingual'}
                  </button>
                ))}
              </div>
            </div>
            <CloudApiKeyInput
              label={`${CLOUD_PROVIDERS.find((p) => p.id === cloudProvider)?.label ?? cloudProvider} API Key`}
              value={transcription.apiKeys?.[cloudProvider] ?? ''}
              hasKey={hasCloudKey}
              showInput={showCloudInput}
              setShowInput={setShowCloudInput}
              inputValue={cloudKeyInput}
              setInputValue={setCloudKeyInput}
              onSave={(v) => {
                update({
                  apiKeys: { ...(transcription.apiKeys ?? {}), [cloudProvider]: v },
                })
                setCloudKeyInput('')
                setShowCloudInput(false)
              }}
              onCancel={() => {
                setShowCloudInput(false)
                setCloudKeyInput('')
              }}
            />
          </div>
        )}

        {/* Chunk duration (shared) */}
        <div className="space-y-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex justify-between">
            <span className="text-[11px]" style={{ color: 'var(--text)' }}>
              Chunk duration
            </span>
            <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {transcription.chunkDurationSec ?? 2}s
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={transcription.chunkDurationSec ?? 2}
            onChange={(e) => update({ chunkDurationSec: Number(e.target.value) })}
            className="w-full accent-[var(--accent)] h-1"
          />
          <div className="flex justify-between text-[9px]" style={{ color: 'var(--text-muted)' }}>
            <span>1s (fast)</span>
            <span>10s (accurate)</span>
          </div>
        </div>
      </div>
    </Section>
  )
}

function CloudApiKeyInput({
  label,
  hasKey,
  showInput,
  setShowInput,
  inputValue,
  setInputValue,
  onSave,
  onCancel,
}: {
  label: string
  value: string
  hasKey: boolean
  showInput: boolean
  setShowInput: (v: boolean) => void
  inputValue: string
  setInputValue: (v: string) => void
  onSave: (v: string) => void
  onCancel: () => void
}) {
  if (hasKey && !showInput) {
    return (
      <div className="space-y-1">
        <span className="text-[11px]" style={{ color: 'var(--text)' }}>
          {label}
        </span>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
            <span className="text-xs" style={{ color: 'var(--text)' }}>
              API key configured
            </span>
          </div>
          <button
            onClick={() => setShowInput(true)}
            className="text-[10px] px-2 py-0.5 rounded-md border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            Change
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <span className="text-[11px]" style={{ color: 'var(--text)' }}>
        {label}
      </span>
      <div className="flex gap-2">
        <input
          type="password"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = inputValue.trim()
              if (v) {
                onSave(v)
              }
            }
          }}
          placeholder="Enter your API key"
          className="flex-1 bg-transparent outline-none text-xs px-2.5 py-1.5 rounded-lg border"
          style={{
            color: 'var(--text)',
            borderColor: 'var(--input-border)',
            backgroundColor: 'var(--input-bg)',
          }}
        />
        <button
          onClick={() => {
            const v = inputValue.trim()
            if (v) onSave(v)
          }}
          disabled={!inputValue.trim()}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-40"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          Save
        </button>
        {hasKey && (
          <button
            onClick={onCancel}
            className="text-[10px] px-2 py-0.5 rounded-md border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
      <div
        className="rounded-xl p-3 border"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
