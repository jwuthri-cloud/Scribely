import { useEffect, useState, useCallback } from 'react'
import { HotkeyRecorder } from './HotkeyRecorder'
import { useTheme } from '../themes/ThemeProvider'
import { themes as themeMap } from '../themes/registry'
import type { AppSettings, HotkeyConfig, TranscriptionProvider, TranscriptionSettings } from '../types'
import { DEFAULT_HOTKEYS, HOTKEY_LABELS, DEFAULT_SETTINGS, DEFAULT_TRANSCRIPTION } from '../types/settings'

export function SettingsView() {
  const { theme, themeIds, setThemeId } = useTheme()
  const [settings, setSettings] = useState<AppSettings | null>(null)

  // Load settings on mount
  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      setSettings(s)
    })
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
        </div>
      </Section>

      {/* ── Reset All ──────────────────────────── */}
      <div className="pt-2 pb-4">
        <button
          onClick={() => {
            setSettings(DEFAULT_SETTINGS)
            window.electronAPI?.updateSettings(DEFAULT_SETTINGS)
            setThemeId(DEFAULT_SETTINGS.themeId)
          }}
          className="text-xs transition-colors hover:brightness-125"
          style={{ color: 'var(--error)' }}
        >
          Reset all settings to defaults
        </button>
      </div>
    </div>
  )
}

// ── Provider metadata ──────────────────────────────────────
const PROVIDERS: {
  id: TranscriptionProvider
  label: string
  detail: string
  group: 'local' | 'cloud'
}[] = [
  { id: 'local-fast', label: 'Fast', detail: 'small.en ~488MB', group: 'local' },
  { id: 'local-balanced', label: 'Balanced', detail: 'medium.en ~1.5GB', group: 'local' },
  { id: 'local-accurate', label: 'Accurate', detail: 'large-v3-turbo ~1.6GB', group: 'local' },
  { id: 'groq', label: 'Groq', detail: 'whisper-large-v3', group: 'cloud' },
  { id: 'deepgram', label: 'Deepgram', detail: 'Nova-3', group: 'cloud' },
]

function TranscriptionSection({
  transcription,
  onUpdate,
}: {
  transcription: TranscriptionSettings
  onUpdate: (t: TranscriptionSettings) => void
}) {
  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showDgKey, setShowDgKey] = useState(false)
  const [modelStatus, setModelStatus] = useState<{
    available: boolean
    downloading: boolean
    progress: number
  } | null>(null)

  // Fetch model status on mount and when provider changes
  useEffect(() => {
    window.electronAPI?.getModelStatus?.().then((s: any) => {
      setModelStatus(s?.whisperModel || null)
    })
  }, [transcription.provider])

  // Listen for download progress (only move forward, never back)
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

  const setProvider = (provider: TranscriptionProvider) => {
    onUpdate({ ...transcription, provider })
  }

  const setApiKey = (service: 'groq' | 'deepgram', value: string) => {
    onUpdate({
      ...transcription,
      apiKeys: { ...transcription.apiKeys, [service]: value },
    })
  }

  const isCloud = transcription.provider === 'groq' || transcription.provider === 'deepgram'
  const isLocal = transcription.provider.startsWith('local-')

  return (
    <Section title="Transcription">
      <div className="space-y-3">
        {/* Local providers */}
        <div>
          <span
            className="text-[10px] uppercase tracking-wider font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            Local (free)
          </span>
          <div className="flex gap-1.5 mt-1.5">
            {PROVIDERS.filter((p) => p.group === 'local').map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 border text-center"
                style={{
                  backgroundColor:
                    transcription.provider === p.id ? 'var(--accent)' : 'var(--surface)',
                  color: transcription.provider === p.id ? '#fff' : 'var(--text)',
                  borderColor:
                    transcription.provider === p.id ? 'var(--accent)' : 'var(--border)',
                }}
              >
                <div>{p.label}</div>
                <div
                  className="text-[9px] mt-0.5 font-normal"
                  style={{
                    opacity: 0.7,
                    color: transcription.provider === p.id ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {p.detail}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cloud providers */}
        <div>
          <span
            className="text-[10px] uppercase tracking-wider font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            Cloud (API key required)
          </span>
          <div className="flex gap-1.5 mt-1.5">
            {PROVIDERS.filter((p) => p.group === 'cloud').map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 border text-center"
                style={{
                  backgroundColor:
                    transcription.provider === p.id ? 'var(--accent)' : 'var(--surface)',
                  color: transcription.provider === p.id ? '#fff' : 'var(--text)',
                  borderColor:
                    transcription.provider === p.id ? 'var(--accent)' : 'var(--border)',
                }}
              >
                <div>{p.label}</div>
                <div
                  className="text-[9px] mt-0.5 font-normal"
                  style={{
                    opacity: 0.7,
                    color: transcription.provider === p.id ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {p.detail}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* API key inputs — shown when cloud provider is selected */}
        {transcription.provider === 'groq' && (
          <div className="space-y-1">
            <span className="text-[11px]" style={{ color: 'var(--text)' }}>
              Groq API Key
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type={showGroqKey ? 'text' : 'password'}
                value={transcription.apiKeys.groq || ''}
                onChange={(e) => setApiKey('groq', e.target.value)}
                placeholder="gsk_..."
                className="flex-1 text-xs px-2 py-1.5 rounded-lg border outline-none bg-transparent"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              />
              <button
                onClick={() => setShowGroqKey(!showGroqKey)}
                className="text-[10px] px-1.5 py-1 rounded"
                style={{ color: 'var(--text-muted)' }}
              >
                {showGroqKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        )}

        {transcription.provider === 'deepgram' && (
          <div className="space-y-1">
            <span className="text-[11px]" style={{ color: 'var(--text)' }}>
              Deepgram API Key
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type={showDgKey ? 'text' : 'password'}
                value={transcription.apiKeys.deepgram || ''}
                onChange={(e) => setApiKey('deepgram', e.target.value)}
                placeholder="Enter API key..."
                className="flex-1 text-xs px-2 py-1.5 rounded-lg border outline-none bg-transparent"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              />
              <button
                onClick={() => setShowDgKey(!showDgKey)}
                className="text-[10px] px-1.5 py-1 rounded"
                style={{ color: 'var(--text-muted)' }}
              >
                {showDgKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        )}

        {/* Model status for local providers */}
        {isLocal && modelStatus && (
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
                  className="h-full rounded-full transition-all duration-300"
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
                className="text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:brightness-110"
                style={{
                  borderColor: 'var(--accent)',
                  color: 'var(--accent)',
                }}
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

        {/* Missing API key warning for cloud */}
        {isCloud && !transcription.apiKeys[transcription.provider as 'groq' | 'deepgram'] && (
          <span
            className="text-[10px] block"
            style={{ color: 'var(--warning, var(--error))' }}
          >
            API key required for {transcription.provider === 'groq' ? 'Groq' : 'Deepgram'}
          </span>
        )}

        {/* Chunk duration slider */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--text)' }}>
              Chunk duration
            </span>
            <span
              className="text-[11px] font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              {transcription.chunkDurationSec ?? 2}s
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={transcription.chunkDurationSec ?? 2}
            onChange={(e) =>
              onUpdate({ ...transcription, chunkDurationSec: Number(e.target.value) })
            }
            className="w-full accent-[var(--accent)] h-1"
          />
          <div
            className="flex justify-between text-[9px]"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>1s (fast)</span>
            <span>10s (accurate)</span>
          </div>
        </div>
      </div>
    </Section>
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
