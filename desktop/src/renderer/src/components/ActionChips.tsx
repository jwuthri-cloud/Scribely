import type { QuickAction } from '../types/settings'
import { DEFAULT_QUICK_ACTIONS } from '../types/settings'
import { getQuickActionIcon } from './QuickActionIcons'

interface ActionChipsProps {
  onAction: (action: string) => void
  /** Custom quick actions. Empty/undefined = use defaults. */
  customActions?: QuickAction[]
}

export function ActionChips({
  onAction,
  customActions,
}: ActionChipsProps) {
  const actions = customActions?.length ? customActions : DEFAULT_QUICK_ACTIONS

  return (
    <div className="flex gap-1.5 px-4 py-2 flex-wrap shrink-0 items-center">
      {actions.map((a, i) => (
        <button
          key={`${a.value}-${i}`}
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
