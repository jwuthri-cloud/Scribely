import type { QuickAction } from '../types/settings'
import { DEFAULT_QUICK_ACTIONS } from '../types/settings'
import { getQuickActionIcon } from './QuickActionIcons'

interface ActionChipsProps {
  onAction: (action: string) => void
  /** When provided, Summarize chip triggers transcript summarization instead of sending a chat message */
  onSummarizeTranscript?: () => Promise<void>
  summarizeInProgress?: boolean
  /** When true, shows a "View summary" chip that opens the summary popup */
  hasSummary?: boolean
  onViewSummary?: () => void
  /** Custom quick actions (max 4). Empty/undefined = use defaults. Summarize is always first. */
  customActions?: QuickAction[]
}

const SUMMARIZE_ICON = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16M4 12h10M4 18h14" />
  </svg>
)

export function ActionChips({
  onAction,
  onSummarizeTranscript,
  summarizeInProgress = false,
  hasSummary = false,
  onViewSummary,
  customActions,
}: ActionChipsProps) {
  const actions = (customActions?.length ? customActions : DEFAULT_QUICK_ACTIONS).slice(0, 4)

  return (
    <div className="flex gap-1.5 px-4 py-2 flex-wrap shrink-0 items-center">
      {hasSummary && onViewSummary && (
        <button
          onClick={onViewSummary}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 hover:brightness-125 active:scale-[0.97] border border-dashed"
          style={{
            backgroundColor: 'var(--chip-bg)',
            color: 'var(--accent)',
            borderColor: 'var(--accent)',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
          View summary
        </button>
      )}
      {/* Summarize (always first, fixed) */}
      <button
        onClick={() => {
          if (onSummarizeTranscript) {
            onSummarizeTranscript()
          } else {
            onAction('Summarize this')
          }
        }}
        disabled={!!onSummarizeTranscript && summarizeInProgress}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 hover:brightness-125 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--chip-bg)',
          color: 'var(--chip-text)',
          border: '1px solid var(--border)',
        }}
      >
        <span style={{ opacity: 0.6 }}>{SUMMARIZE_ICON}</span>
        {summarizeInProgress ? 'Summarizing…' : 'Summarize'}
      </button>
      {/* Custom or default actions */}
      {actions.map((a) => (
        <button
          key={a.value}
          onClick={() => onAction(a.value)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 hover:brightness-125 active:scale-[0.97]"
          style={{
            backgroundColor: 'var(--chip-bg)',
            color: 'var(--chip-text)',
            border: '1px solid var(--border)',
          }}
        >
          <span style={{ opacity: 0.6 }}>{getQuickActionIcon(a.icon, a.value)}</span>
          {a.label}
        </button>
      ))}
    </div>
  )
}
