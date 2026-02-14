interface ActionChipsProps {
  onAction: (action: string) => void
  /** When provided, Summarize chip triggers transcript summarization instead of sending a chat message */
  onSummarizeTranscript?: () => Promise<void>
  summarizeInProgress?: boolean
  /** When true, shows a "View summary" chip that opens the summary popup */
  hasSummary?: boolean
  onViewSummary?: () => void
}

const ACTIONS = [
  {
    label: 'Summarize now',
    value: 'Summarize this',
    isSummarizeTranscript: true,
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 12h10M4 18h14" />
      </svg>
    ),
  },
  {
    label: 'Explain',
    value: 'Explain this',
    isSummarizeTranscript: false,
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    label: 'Fix code',
    value: 'Fix this code',
    isSummarizeTranscript: false,
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    label: 'Rewrite',
    value: 'Rewrite this',
    isSummarizeTranscript: false,
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
]

export function ActionChips({
  onAction,
  onSummarizeTranscript,
  summarizeInProgress = false,
  hasSummary = false,
  onViewSummary,
}: ActionChipsProps) {
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
      {ACTIONS.map((a) => {
        const isSummarize = (a as { isSummarizeTranscript?: boolean }).isSummarizeTranscript
        const useTranscriptSummarize = isSummarize && onSummarizeTranscript
        const handleClick = () => {
          if (useTranscriptSummarize) {
            onSummarizeTranscript()
          } else {
            onAction(a.value)
          }
        }
        const disabled = useTranscriptSummarize && summarizeInProgress
        const label =
          useTranscriptSummarize && summarizeInProgress ? 'Summarizing…' : a.label

        return (
          <button
            key={a.value}
            onClick={handleClick}
            disabled={disabled}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 hover:brightness-125 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--chip-bg)',
              color: 'var(--chip-text)',
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ opacity: 0.6 }}>{a.icon}</span>
            {label}
          </button>
        )
      })}
    </div>
  )
}
