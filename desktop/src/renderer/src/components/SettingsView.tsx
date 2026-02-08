import { useEffect, useState, useCallback } from 'react'
import { HotkeyRecorder } from './HotkeyRecorder'
import { useTheme } from '../themes/ThemeProvider'
import type { AppSettings, HotkeyConfig } from '../types'
import { DEFAULT_HOTKEYS, HOTKEY_LABELS, DEFAULT_SETTINGS } from '../types/settings'

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
        <div className="flex flex-wrap gap-2">
          {themeIds.map((id) => (
            <button
              key={id}
              onClick={() => {
                setThemeId(id)
                updateSetting('themeId', id)
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border"
              style={{
                backgroundColor: theme.id === id ? 'var(--accent)' : 'var(--surface)',
                color: theme.id === id ? '#fff' : 'var(--text)',
                borderColor: theme.id === id ? 'var(--accent)' : 'var(--border)',
              }}
            >
              {id
                .split('-')
                .map((w) => w[0].toUpperCase() + w.slice(1))
                .join(' ')}
            </button>
          ))}
        </div>
      </Section>

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
