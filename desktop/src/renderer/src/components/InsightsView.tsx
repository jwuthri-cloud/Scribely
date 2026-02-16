import { useEffect, useState, useCallback } from 'react'
import type { AppSettings } from '../types'
import {
  DEFAULT_INSIGHTS,
  type InsightsSettings,
} from '../types/settings'

const DETECTOR_LABELS: Record<
  keyof Pick<
    InsightsSettings,
    | 'detectQuestions'
    | 'detectTopicChanges'
    | 'detectActionItems'
    | 'detectKeyMentions'
    | 'detectDecisions'
  >,
  string
> = {
  detectQuestions: 'Questions',
  detectTopicChanges: 'Topic changes',
  detectActionItems: 'Action items',
  detectKeyMentions: 'Key mentions',
  detectDecisions: 'Decisions',
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

export function InsightsView() {
  const [insights, setInsights] = useState<InsightsSettings>(DEFAULT_INSIGHTS)
  const [extraKeywordsInput, setExtraKeywordsInput] = useState('')

  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      const current = s?.llm?.insights ?? DEFAULT_INSIGHTS
      setInsights(current)
      setExtraKeywordsInput((current.extraQuestionKeywords ?? []).join(', '))
    })
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onSettingsChanged?.((s) => {
      const current = s?.llm?.insights ?? DEFAULT_INSIGHTS
      setInsights(current)
      setExtraKeywordsInput((current.extraQuestionKeywords ?? []).join(', '))
    })
    return () => unsubscribe?.()
  }, [])

  const updateInsights = useCallback((next: Partial<InsightsSettings>) => {
    const merged = { ...insights, ...next }
    setInsights(merged)
    window.electronAPI?.updateSettings({ llm: { insights: merged } } as Partial<AppSettings>)
  }, [insights])

  const toggle = (key: keyof InsightsSettings, value: boolean) => {
    updateInsights({ [key]: value })
  }

  const saveExtraKeywords = () => {
    const keywords = extraKeywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    updateInsights({ extraQuestionKeywords: keywords })
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        <Section title="Live insights">
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
              <span
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
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
                value={extraKeywordsInput}
                onChange={(e) => setExtraKeywordsInput(e.target.value)}
                onBlur={saveExtraKeywords}
                placeholder="e.g. clarify, explain, tell me"
                className="w-full px-2 py-1.5 rounded-lg text-[11px] border bg-transparent"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              />
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Comma-separated. Saves when you leave the field.
              </p>
            </div>
          </div>
        </Section>
    </div>
  )
}
