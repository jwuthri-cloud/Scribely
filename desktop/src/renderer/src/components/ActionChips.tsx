interface ActionChipsProps {
  onAction: (action: string) => void
}

const ACTIONS = [
  { label: '✨ Summarize', value: 'Summarize this' },
  { label: '💡 Explain', value: 'Explain this' },
  { label: '🔧 Fix code', value: 'Fix this code' },
  { label: '📝 Rewrite', value: 'Rewrite this' },
]

export function ActionChips({ onAction }: ActionChipsProps) {
  return (
    <div className="flex gap-2 px-4 py-2 flex-wrap shrink-0">
      {ACTIONS.map((a) => (
        <button
          key={a.value}
          onClick={() => onAction(a.value)}
          className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 hover:brightness-125 active:scale-95"
          style={{
            backgroundColor: 'var(--chip-bg)',
            color: 'var(--chip-text)',
            border: '1px solid var(--border)',
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}
