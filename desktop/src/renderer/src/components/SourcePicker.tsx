import { useState } from 'react'

interface SourceInfo {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnailDataUrl: string
}

interface SourcePickerProps {
  sources: SourceInfo[]
  onSelect: (sourceId: string) => void
  onDismiss: () => void
}

type Tab = 'window' | 'screen'

export function SourcePicker({ sources, onSelect, onDismiss }: SourcePickerProps) {
  const screens = sources.filter((s) => s.type === 'screen')
  const windows = sources.filter((s) => s.type === 'window')
  const [activeTab, setActiveTab] = useState<Tab>(windows.length > 0 ? 'window' : 'screen')
  const [selected, setSelected] = useState<string | null>(null)

  const displayed = activeTab === 'screen' ? screens : windows

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-[380px] max-h-[520px] rounded-xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Choose what to record
            </span>
            <button
              onClick={onDismiss}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
            {windows.length > 0 && (
              <TabButton active={activeTab === 'window'} onClick={() => setActiveTab('window')}>
                Window
              </TabButton>
            )}
            {screens.length > 0 && (
              <TabButton active={activeTab === 'screen'} onClick={() => setActiveTab('screen')}>
                Entire Screen
              </TabButton>
            )}
          </div>
        </div>

        {/* Source list */}
        <div className="overflow-y-auto p-3 flex-1">
          <div className="grid grid-cols-2 gap-2">
            {displayed.map((s) => (
              <SourceCard
                key={s.id}
                source={s}
                isSelected={selected === s.id}
                onSelect={() => setSelected(s.id)}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{
              color: 'var(--text)',
              backgroundColor: 'var(--overlay)',
              border: '1px solid var(--border)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity"
            style={{
              color: selected ? '#fff' : 'var(--text-muted)',
              backgroundColor: selected ? 'var(--accent)' : 'var(--overlay)',
              border: '1px solid var(--border)',
              opacity: selected ? 1 : 0.5,
              cursor: selected ? 'pointer' : 'not-allowed',
            }}
          >
            Share
          </button>
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 text-xs font-medium transition-colors relative"
      style={{
        color: active ? 'var(--accent)' : 'var(--text-muted)',
      }}
    >
      {children}
      {active && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
          style={{ backgroundColor: 'var(--accent)' }}
        />
      )}
    </button>
  )
}

function SourceCard({
  source,
  isSelected,
  onSelect,
}: {
  source: SourceInfo
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="rounded-lg overflow-hidden text-left transition-all outline-none"
      style={{
        backgroundColor: 'var(--overlay)',
        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
        padding: isSelected ? 0 : 1,
      }}
    >
      <img
        src={source.thumbnailDataUrl}
        alt={source.name}
        className="w-full aspect-video object-cover"
        style={{ backgroundColor: '#000' }}
      />
      <div
        className="px-2 py-1.5 text-[11px] truncate"
        style={{ color: 'var(--text)', borderTop: '1px solid var(--border)' }}
      >
        {source.name}
      </div>
    </button>
  )
}
