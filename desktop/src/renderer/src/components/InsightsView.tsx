import { useEffect, useState, useCallback } from 'react'
import {
  DEFAULT_QUESTION_VERBS,
  DEFAULT_QUESTION_WORDS,
} from '../../../shared/insight-defaults'
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
  >,
  string
> = {
  detectQuestions: 'Questions',
  detectTopicChanges: 'Topic changes',
  detectActionItems: 'Action items',
  detectKeyMentions: 'Key mentions',
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

function ChipList({
  items,
  onRemove,
  removable = false,
}: {
  items: string[]
  onRemove?: (item: string) => void
  removable?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px]"
          style={{
            backgroundColor: 'var(--overlay)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
          }}
        >
          {item}
          {removable && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(item)}
              className="ml-0.5 -mr-0.5 p-0.5 rounded hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}
              aria-label={`Remove ${item}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

function AddChipRow({
  placeholder,
  onAdd,
}: {
  placeholder: string
  onAdd: (value: string) => void
}) {
  const [input, setInput] = useState('')
  const handleAdd = () => {
    const trimmed = input.trim()
    if (trimmed) {
      onAdd(trimmed)
      setInput('')
    }
  }
  return (
    <div className="flex gap-2 mt-1.5">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        placeholder={placeholder}
        className="flex-1 px-2 py-1.5 rounded-lg text-[11px] border bg-transparent"
        style={{
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      />
      <button
        type="button"
        onClick={handleAdd}
        className="px-2 py-1.5 rounded-lg text-[11px] font-medium"
        style={{
          backgroundColor: 'var(--accent)',
          color: 'white',
        }}
      >
        Add
      </button>
    </div>
  )
}

export function InsightsView() {
  const [insights, setInsights] = useState<InsightsSettings>(DEFAULT_INSIGHTS)

  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      const current = s?.llm?.insights ?? DEFAULT_INSIGHTS
      setInsights(current)
    })
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onSettingsChanged?.((s) => {
      const current = s?.llm?.insights ?? DEFAULT_INSIGHTS
      setInsights(current)
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

  const addQuestionWord = (word: string) => {
    const current = insights.extraQuestionWords ?? []
    if (current.includes(word)) return
    updateInsights({ extraQuestionWords: [...current, word] })
  }

  const removeQuestionWord = (word: string) => {
    const current = insights.extraQuestionWords ?? []
    updateInsights({ extraQuestionWords: current.filter((w) => w !== word) })
  }

  const addQuestionVerb = (verb: string) => {
    const current = insights.extraQuestionVerbs ?? []
    if (current.includes(verb)) return
    updateInsights({ extraQuestionVerbs: [...current, verb] })
  }

  const removeQuestionVerb = (verb: string) => {
    const current = insights.extraQuestionVerbs ?? []
    updateInsights({ extraQuestionVerbs: current.filter((v) => v !== verb) })
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

            {/* ML question gate */}
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text)' }}>
                ML question filter
              </span>
              <button
                onClick={() => toggle('questionMlEnabled', !(insights.questionMlEnabled ?? true))}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  insights.questionMlEnabled !== false ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    insights.questionMlEnabled !== false ? 'left-4' : 'left-0.5'
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

          {/* Question detection — when Questions enabled */}
          {insights.detectQuestions !== false && (
            <div className="space-y-3 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <span
                className="text-[10px] font-medium uppercase tracking-wider block"
                style={{ color: 'var(--text-muted)' }}
              >
                Question detection
              </span>

              {/* Question words */}
              <div className="space-y-1">
                <span className="text-[11px]" style={{ color: 'var(--text)' }}>
                  Question words
                </span>
                <ChipList items={[...DEFAULT_QUESTION_WORDS]} removable={false} />
                {(insights.extraQuestionWords ?? []).length > 0 && (
                  <ChipList
                    items={insights.extraQuestionWords ?? []}
                    onRemove={removeQuestionWord}
                    removable
                  />
                )}
                <AddChipRow placeholder="Add word or phrase" onAdd={addQuestionWord} />
              </div>

              {/* Question verbs */}
              <div className="space-y-1">
                <span className="text-[11px]" style={{ color: 'var(--text)' }}>
                  Question verbs
                </span>
                <ChipList items={[...DEFAULT_QUESTION_VERBS]} removable={false} />
                {(insights.extraQuestionVerbs ?? []).length > 0 && (
                  <ChipList
                    items={insights.extraQuestionVerbs ?? []}
                    onRemove={removeQuestionVerb}
                    removable
                  />
                )}
                <AddChipRow placeholder="Add verb" onAdd={addQuestionVerb} />
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}
