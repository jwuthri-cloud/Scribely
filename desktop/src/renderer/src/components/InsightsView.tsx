import { useEffect, useState, useCallback } from 'react'
import {
  getAllBuiltInKeywords,
  type TranscriptionLanguage,
} from '../../../shared/insight-defaults'
import type { AppSettings } from '../types'
import {
  DEFAULT_INSIGHTS,
  INSIGHT_PRESETS,
  type InsightsSettings,
  type InsightPreset,
  type SpeakerFilter,
} from '../types/settings'

// ── Preset definitions ──────────────────────────────────

const PRESET_IDS: Exclude<InsightPreset, 'custom'>[] = ['minimal', 'recommended', 'power']

const SPEAKER_OPTIONS: { value: SpeakerFilter; label: string }[] = [
  { value: 'you', label: 'You' },
  { value: 'them', label: 'Them' },
  { value: 'both', label: 'Both' },
]

const LANG_LABELS: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  zh: 'Chinese',
  vi: 'Vietnamese',
}

const DETECTORS: {
  key: keyof Pick<InsightsSettings, 'detectQuestions' | 'detectTopicChanges' | 'detectActionItems' | 'detectKeyMentions'>
  icon: string
  label: string
  description: string
  /** Not yet shipped: row is read-only with a “Coming soon” tag */
  comingSoon?: boolean
}[] = [
  { key: 'detectQuestions', icon: '?', label: 'Questions', description: 'Catch questions asked during the meeting' },
  { key: 'detectTopicChanges', icon: '~', label: 'Topic changes', description: 'Notice when the conversation shifts', comingSoon: true },
  { key: 'detectActionItems', icon: '\u2713', label: 'Action items', description: 'Spot tasks and commitments', comingSoon: true },
  { key: 'detectKeyMentions', icon: '@', label: 'Key mentions', description: 'Flag names, dates, amounts, and URLs', comingSoon: true },
]

// ── Helpers ──────────────────────────────────────────────

function detectPreset(s: InsightsSettings): InsightPreset {
  for (const id of PRESET_IDS) {
    const { config } = INSIGHT_PRESETS[id]
    const match =
      s.enrichmentEnabled === config.enrichmentEnabled &&
      s.detectQuestions === config.detectQuestions &&
      s.detectTopicChanges === config.detectTopicChanges &&
      s.detectActionItems === config.detectActionItems &&
      s.detectKeyMentions === config.detectKeyMentions &&
      s.questionMlEnabled === config.questionMlEnabled &&
      s.speakerFilter === config.speakerFilter
    if (match) return id
  }
  return 'custom'
}

// ── Sub-components ───────────────────────────────────────

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
        disabled ? 'opacity-45 cursor-not-allowed' : ''
      } ${on ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          on ? 'left-4' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div
      className="inline-flex rounded-lg p-0.5 gap-0.5"
      style={{ backgroundColor: 'var(--overlay)' }}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-3 py-1 rounded-md text-[11px] font-medium transition-all"
            style={{
              backgroundColor: active ? 'var(--accent)' : 'transparent',
              color: active ? 'white' : 'var(--text-muted)',
            }}
          >
            {opt.label}
          </button>
        )
      })}
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

function CollapseSection({
  label,
  children,
  open,
  onToggle,
}: {
  label: string
  children: React.ReactNode
  open: boolean
  onToggle: () => void
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full py-1 text-[11px] font-medium"
        style={{ color: 'var(--text-muted)' }}
      >
        <span
          className="transition-transform inline-block text-[9px]"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
        {label}
      </button>
      {open && <div className="pt-1 pl-1">{children}</div>}
    </div>
  )
}

function ChipList({
  items,
  onRemove,
}: {
  items: string[]
  onRemove: (item: string) => void
}) {
  if (items.length === 0) return null
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
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="ml-0.5 -mr-0.5 p-0.5 rounded hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            aria-label={`Remove ${item}`}
          >
            ×
          </button>
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

// ── Main component ───────────────────────────────────────

export function InsightsView() {
  const [insights, setInsights] = useState<InsightsSettings>(DEFAULT_INSIGHTS)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [keywordsOpen, setKeywordsOpen] = useState(false)
  const [viewBuiltInOpen, setViewBuiltInOpen] = useState(false)
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<TranscriptionLanguage>('en')

  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      const current = { ...DEFAULT_INSIGHTS, ...s?.llm?.insights }
      setInsights(current)
      const lang = (s?.transcription as { language?: TranscriptionLanguage })?.language ?? 'en'
      setTranscriptionLanguage(lang)
    })
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onSettingsChanged?.((s) => {
      const current = { ...DEFAULT_INSIGHTS, ...s?.llm?.insights }
      setInsights(current)
      const lang = (s?.transcription as { language?: TranscriptionLanguage })?.language ?? 'en'
      setTranscriptionLanguage(lang)
    })
    return () => unsubscribe?.()
  }, [])

  const updateInsights = useCallback(
    (next: Partial<InsightsSettings>) => {
      const merged = { ...insights, ...next }
      merged.insightPreset = detectPreset(merged)
      setInsights(merged)
      window.electronAPI?.updateSettings({ llm: { insights: merged } } as Partial<AppSettings>)
    },
    [insights],
  )

  const applyPreset = useCallback(
    (presetId: Exclude<InsightPreset, 'custom'>) => {
      const { config } = INSIGHT_PRESETS[presetId]
      const merged: InsightsSettings = {
        ...insights,
        ...config,
        insightPreset: presetId,
      }
      setInsights(merged)
      window.electronAPI?.updateSettings({ llm: { insights: merged } } as Partial<AppSettings>)
    },
    [insights],
  )

  const activePreset = insights.insightPreset === 'custom'
    ? detectPreset(insights)
    : insights.insightPreset ?? detectPreset(insights)

  const isSmart = insights.enrichmentEnabled

  const extraWords = insights.extraQuestionWords ?? []
  const extraVerbs = insights.extraQuestionVerbs ?? []
  const builtIn = getAllBuiltInKeywords(transcriptionLanguage)
  const builtInWordsCount = builtIn.words.length
  const builtInVerbsCount = builtIn.verbs.length

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {/* Master toggle */}
      <Section title="Live insights">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-medium block" style={{ color: 'var(--text)' }}>
              Enable live insights
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Real-time detection of questions, decisions, and more
            </span>
          </div>
          <Toggle on={insights.enabled} onChange={(v) => updateInsights({ enabled: v })} />
        </div>
      </Section>

      {insights.enabled && (
        <>
          {/* Preset profiles */}
          <Section title="Profile">
            <div className="space-y-2.5">
              <div className="flex gap-2">
                {PRESET_IDS.map((id) => {
                  const preset = INSIGHT_PRESETS[id]
                  const active = activePreset === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => applyPreset(id)}
                      className="flex-1 rounded-lg px-2 py-2 text-center transition-all border"
                      style={{
                        backgroundColor: active ? 'var(--accent)' : 'var(--overlay)',
                        borderColor: active ? 'var(--accent)' : 'var(--border)',
                        color: active ? 'white' : 'var(--text)',
                      }}
                    >
                      <span className="text-[11px] font-semibold block">{preset.label}</span>
                    </button>
                  )
                })}
              </div>
              {/* Description of active preset */}
              <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                {activePreset !== 'custom'
                  ? INSIGHT_PRESETS[activePreset].description
                  : 'Custom configuration'}
              </p>
            </div>
          </Section>

          {/* Speaker filter */}
          <Section title="Detect insights from">
            <div className="flex justify-center">
              <SegmentedControl
                options={SPEAKER_OPTIONS}
                value={insights.speakerFilter ?? 'both'}
                onChange={(v) => updateInsights({ speakerFilter: v })}
              />
            </div>
          </Section>

          {/* Customize (collapsed) */}
          <Section title="Advanced">
            <CollapseSection
              label="Customize"
              open={customizeOpen}
              onToggle={() => setCustomizeOpen(!customizeOpen)}
            >
              <div className="space-y-4">
                {/* Detection mode */}
                <div className="space-y-1.5">
                  <span
                    className="text-[10px] font-medium uppercase tracking-wider block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Detection mode
                  </span>
                  <SegmentedControl
                    options={[
                      { value: 'fast', label: 'Fast' },
                      { value: 'smart', label: 'Smart' },
                    ]}
                    value={isSmart ? 'smart' : 'fast'}
                    onChange={(v) =>
                      updateInsights({
                        enrichmentEnabled: v === 'smart',
                        questionMlEnabled: v === 'smart',
                      })
                    }
                  />
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {isSmart
                      ? 'AI validates and enriches detected events. Higher quality, uses API calls.'
                      : 'Heuristics only. Instant results, zero API cost.'}
                  </p>
                </div>

                {/* Per-detector toggles */}
                <div className="space-y-1.5">
                  <span
                    className="text-[10px] font-medium uppercase tracking-wider block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Detectors
                  </span>
                  <div className="space-y-1">
                    {DETECTORS.map(({ key, icon, label, description, comingSoon }) => (
                      <div
                        key={key}
                        className="flex items-center gap-2 py-1"
                      >
                        <span
                          className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold shrink-0"
                          style={{
                            backgroundColor: 'var(--overlay)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {icon}
                        </span>
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          {comingSoon && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0"
                              style={{
                                backgroundColor: 'var(--accent)',
                                color: 'white',
                              }}
                            >
                              Coming soon
                            </span>
                          )}
                          <div>
                            <span className="text-[11px] block" style={{ color: 'var(--text)' }}>
                              {label}
                            </span>
                            <span className="text-[9px] block" style={{ color: 'var(--text-muted)' }}>
                              {description}
                            </span>
                          </div>
                        </div>
                        <Toggle
                          on={comingSoon ? false : insights[key] !== false}
                          disabled={!!comingSoon}
                          onChange={(v) => updateInsights({ [key]: v })}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom keywords (nested collapse, only when questions enabled) */}
                {insights.detectQuestions !== false && (
                  <CollapseSection
                    label={`Custom keywords (${builtInWordsCount} built-in words, ${builtInVerbsCount} built-in verbs${extraWords.length + extraVerbs.length > 0 ? ` + ${extraWords.length + extraVerbs.length} custom` : ''})`}
                    open={keywordsOpen}
                    onToggle={() => setKeywordsOpen(!keywordsOpen)}
                  >
                    <div className="space-y-3 pt-1">
                      {/* View built-in keywords affordance */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewBuiltInOpen(!viewBuiltInOpen)}
                          className="text-[10px] font-medium underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          {viewBuiltInOpen ? 'Hide built-in keywords' : 'View built-in keywords'}
                        </button>
                      </div>
                      {viewBuiltInOpen && (
                        <div
                          className="rounded-lg p-2.5 max-h-48 overflow-y-auto space-y-2"
                          style={{
                            backgroundColor: 'var(--overlay)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {builtIn.byLang ? (
                            Object.entries(builtIn.byLang).map(([langCode, { words, verbs }]) => (
                              <div key={langCode} className="space-y-1">
                                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                                  {LANG_LABELS[langCode] ?? langCode}
                                </span>
                                <div className="text-[10px]" style={{ color: 'var(--text)' }}>
                                  <span className="font-medium">Words: </span>
                                  <span>{words.join(', ')}</span>
                                </div>
                                <div className="text-[10px]" style={{ color: 'var(--text)' }}>
                                  <span className="font-medium">Verbs: </span>
                                  <span>{verbs.join(', ')}</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <>
                              <div className="text-[10px]" style={{ color: 'var(--text)' }}>
                                <span className="font-medium">Question words: </span>
                                <span>{builtIn.words.join(', ')}</span>
                              </div>
                              <div className="text-[10px]" style={{ color: 'var(--text)' }}>
                                <span className="font-medium">Question verbs: </span>
                                <span>{builtIn.verbs.join(', ')}</span>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Extra question words */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                          Question words
                          <span className="font-normal ml-1">
                            ({builtInWordsCount} built-in{extraWords.length > 0 ? ` + ${extraWords.length} custom` : ''})
                          </span>
                        </span>
                        <ChipList items={extraWords} onRemove={(w) => {
                          updateInsights({ extraQuestionWords: extraWords.filter((x) => x !== w) })
                        }} />
                        <AddChipRow
                          placeholder="Add word or phrase"
                          onAdd={(w) => {
                            if (!extraWords.includes(w)) {
                              updateInsights({ extraQuestionWords: [...extraWords, w] })
                            }
                          }}
                        />
                      </div>

                      {/* Extra question verbs */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                          Question verbs
                          <span className="font-normal ml-1">
                            ({builtInVerbsCount} built-in{extraVerbs.length > 0 ? ` + ${extraVerbs.length} custom` : ''})
                          </span>
                        </span>
                        <ChipList items={extraVerbs} onRemove={(v) => {
                          updateInsights({ extraQuestionVerbs: extraVerbs.filter((x) => x !== v) })
                        }} />
                        <AddChipRow
                          placeholder="Add verb"
                          onAdd={(v) => {
                            if (!extraVerbs.includes(v)) {
                              updateInsights({ extraQuestionVerbs: [...extraVerbs, v] })
                            }
                          }}
                        />
                      </div>
                    </div>
                  </CollapseSection>
                )}
              </div>
            </CollapseSection>
          </Section>
        </>
      )}
    </div>
  )
}
