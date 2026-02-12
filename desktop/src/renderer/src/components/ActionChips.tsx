interface ActionChipsProps {
  onAction: (action: string) => void
}

const ACTIONS = [
  {
    label: 'Summarize',
    value: 'Summarize this',
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 12h10M4 18h14" />
      </svg>
    ),
  },
  {
    label: 'Explain',
    value: 'Explain this',
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
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    label: 'Rewrite',
    value: 'Rewrite this',
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
]

export function ActionChips({ onAction }: ActionChipsProps) {
  return (
    <div className="flex gap-1.5 px-4 py-2 flex-wrap shrink-0">
      {ACTIONS.map((a) => (
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
          <span style={{ opacity: 0.6 }}>{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>
  )
}
