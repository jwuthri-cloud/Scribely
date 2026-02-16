import { useEffect, useState, useCallback } from 'react'
import { HotkeyRecorder } from './HotkeyRecorder'
import { useTheme } from '../themes/ThemeProvider'
import { themes as themeMap } from '../themes/registry'
import type { AppSettings, HotkeyConfig, TranscriptionProvider, TranscriptionSettings } from '../types'
import {
  DEFAULT_HOTKEYS,
  HOTKEY_LABELS,
  DEFAULT_SETTINGS,
  DEFAULT_TRANSCRIPTION,
  DEFAULT_INSIGHTS,
  FONT_SIZE_LABELS,
  type FontSize,
  type InsightsSettings,
} from '../types/settings'

export interface SettingsViewProps {
  onReRunSetup?: () => void
}

export function SettingsView({ onReRunSetup }: SettingsViewProps) {
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

  const updateInsights = useCallback(
    (insights: Partial<InsightsSettings>) => {
      if (!settings) return
      const current = settings.llm?.insights ?? DEFAULT_INSIGHTS
      const next = { ...current, ...insights }
      const updated = {
        ...settings,
        llm: { ...settings.llm, insights: next },
      }
      setSettings(updated)
      window.electronAPI?.updateSettings({ llm: { insights: next } } as Partial<AppSettings>)
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

      {/* ── Insights ───────────────────────────── */}
      <InsightsSection
        insights={settings.llm?.insights ?? DEFAULT_INSIGHTS}
        onUpdate={updateInsights}
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

// ── Insights section ───────────────────────────────────────
const DETECTOR_LABELS: Record<keyof Pick<InsightsSettings, 'detectQuestions' | 'detectTopicChanges' | 'detectActionItems' | 'detectKeyMentions' | 'detectDecisions'>, string> = {
  detectQuestions: 'Questions',
  detectTopicChanges: 'Topic changes',
  detectActionItems: 'Action items',
  detectKeyMentions: 'Key mentions',
  detectDecisions: 'Decisions',
}

function InsightsSection({
  insights,
  onUpdate,
}: {
  insights: InsightsSettings
  onUpdate: (insights: Partial<InsightsSettings>) => void
}) {
  const toggle = (key: keyof InsightsSettings, value: boolean) => {
    onUpdate({ [key]: value })
  }

  const extraKeywordsText = (insights.extraQuestionKeywords ?? []).join(', ')
  const setExtraKeywords = (text: string) => {
    const keywords = text
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    onUpdate({ extraQuestionKeywords: keywords })
  }

  return (
    <Section title="Insights">
      <div className="space-y-3">
        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--text)' }}>
            Enable live insights
          </span>
          <button
            onClick={() => toggle('enabled', !insights.enabled)}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              insights.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                insights.enabled ? 'left-4' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {/* LLM enrichment */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--text)' }}>
            LLM enrichment
          </span>
          <button
            onClick={() => toggle('enrichmentEnabled', !insights.enrichmentEnabled)}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              insights.enrichmentEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                insights.enrichmentEnabled ? 'left-4' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {/* Per-detector toggles */}
        <div className="pt-1 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Event detectors
          </span>
          {(Object.keys(DETECTOR_LABELS) as (keyof typeof DETECTOR_LABELS)[]).map((key) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--text)' }}>
                {DETECTOR_LABELS[key]}
              </span>
              <button
                onClick={() => toggle(key, !(insights[key] ?? true))}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  insights[key] !== false ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    insights[key] !== false ? 'left-4' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Extra question keywords */}
        <div className="space-y-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[11px]" style={{ color: 'var(--text)' }}>
            Extra question keywords
          </span>
          <input
            type="text"
            value={extraKeywordsText}
            onChange={(e) => setExtraKeywords(e.target.value)}
            placeholder="e.g. clarify, explain, tell me"
            className="w-full px-2 py-1.5 rounded-lg text-[11px] border bg-transparent"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          />
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Comma-separated. Adds to question detection.
          </p>
        </div>
      </div>
    </Section>
  )
}

// ── Provider metadata ──────────────────────────────────────
const PROVIDERS: {
  id: TranscriptionProvider
  label: string
  detail: string
}[] = [
  { id: 'local-fast', label: 'Fast', detail: 'small.en ~0.5GB' },
  { id: 'local-balanced', label: 'Balanced', detail: 'medium.en ~1.5GB' },
  { id: 'local-accurate', label: 'Accurate', detail: 'large.en ~2GB' },
]

function TranscriptionSection({
  transcription,
  onUpdate,
}: {
  transcription: TranscriptionSettings
  onUpdate: (t: TranscriptionSettings) => void
}) {
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

  return (
    <Section title="Transcription">
      <div className="space-y-3">
        {/* Provider selection */}
        <div className="flex gap-1.5">
          {PROVIDERS.map((p) => (
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

        {/* Model status */}
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
