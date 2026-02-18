import { useState, useMemo, useEffect } from 'react'
import type { SourceInfo } from '../hooks/useMeetingRecorder'

interface SourcePickerProps {
  sources: SourceInfo[]
  onSelect: (sourceId: string) => void
  onDismiss: () => void
}

type Tab = 'tabs' | 'windows' | 'screens'

/** Known Chromium-based browser process names / window title suffixes */
const BROWSER_SUFFIXES = [
  ' - Google Chrome',
  ' - Arc',
  ' - Brave',
  ' - Microsoft Edge',
  ' - Vivaldi',
  ' - Opera',
  ' - Chromium',
  ' — Google Chrome',
  ' — Arc',
  ' — Brave',
  ' — Microsoft Edge',
  ' — Vivaldi',
  ' — Opera',
  ' — Chromium',
]

interface ParsedBrowserTab {
  source: SourceInfo
  tabTitle: string
  browserName: string
}

function parseBrowserTab(source: SourceInfo): ParsedBrowserTab | null {
  for (const suffix of BROWSER_SUFFIXES) {
    if (source.name.endsWith(suffix)) {
      const tabTitle = source.name.slice(0, -suffix.length).trim()
      const browserName = suffix.replace(/^ [-—] /, '')
      return { source, tabTitle: tabTitle || source.name, browserName }
    }
  }
  return null
}

export function SourcePicker({ sources, onSelect, onDismiss }: SourcePickerProps) {
  const screens = useMemo(() => sources.filter((s) => s.type === 'screen'), [sources])
  const allWindows = useMemo(() => sources.filter((s) => s.type === 'window'), [sources])

  // Separate browser tabs from other windows
  const { browserTabs, otherWindows } = useMemo(() => {
    const tabs: ParsedBrowserTab[] = []
    const other: SourceInfo[] = []
    for (const w of allWindows) {
      const parsed = parseBrowserTab(w)
      if (parsed) {
        tabs.push(parsed)
      } else {
        other.push(w)
      }
    }
    return { browserTabs: tabs, otherWindows: other }
  }, [allWindows])

  const hasTabs = browserTabs.length > 0
  const hasWindows = otherWindows.length > 0
  const hasScreens = screens.length > 0

  const defaultTab: Tab = hasTabs ? 'tabs' : hasWindows ? 'windows' : 'screens'
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab)
  const [selected, setSelected] = useState<string | null>(null)

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-picker-title"
    >
      <div
        className="w-[420px] max-h-[540px] rounded-xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center justify-between mb-2">
            <span id="source-picker-title" className="text-sm font-medium" style={{ color: 'var(--text)' }}>
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
            {hasTabs && (
              <TabButton active={activeTab === 'tabs'} onClick={() => setActiveTab('tabs')}>
                Browser Tabs
              </TabButton>
            )}
            {hasWindows && (
              <TabButton active={activeTab === 'windows'} onClick={() => setActiveTab('windows')}>
                Windows
              </TabButton>
            )}
            {hasScreens && (
              <TabButton active={activeTab === 'screens'} onClick={() => setActiveTab('screens')}>
                Entire Screen
              </TabButton>
            )}
          </div>
        </div>

        {/* Source list */}
        <div className="overflow-y-auto p-3 flex-1">
          {activeTab === 'tabs' && (
            <BrowserTabList
              tabs={browserTabs}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {activeTab === 'windows' && (
            <div className="space-y-1.5">
              {otherWindows.map((s) => (
                <WindowRow
                  key={s.id}
                  source={s}
                  isSelected={selected === s.id}
                  onSelect={() => setSelected(s.id)}
                />
              ))}
            </div>
          )}
          {activeTab === 'screens' && (
            <div className="grid grid-cols-2 gap-2">
              {screens.map((s) => (
                <ScreenCard
                  key={s.id}
                  source={s}
                  isSelected={selected === s.id}
                  onSelect={() => setSelected(s.id)}
                />
              ))}
            </div>
          )}
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

/** Browser tabs grouped by browser */
function BrowserTabList({
  tabs,
  selected,
  onSelect,
}: {
  tabs: ParsedBrowserTab[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  // Group by browser name
  const grouped = useMemo(() => {
    const map = new Map<string, ParsedBrowserTab[]>()
    for (const tab of tabs) {
      const existing = map.get(tab.browserName) || []
      existing.push(tab)
      map.set(tab.browserName, existing)
    }
    return Array.from(map.entries())
  }, [tabs])

  return (
    <div className="space-y-3">
      {grouped.map(([browserName, browserTabs]) => (
        <div key={browserName}>
          <div
            className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 px-1"
            style={{ color: 'var(--text-muted)' }}
          >
            {browserName}
          </div>
          <div className="space-y-1">
            {browserTabs.map((tab) => (
              <BrowserTabRow
                key={tab.source.id}
                tab={tab}
                isSelected={selected === tab.source.id}
                onSelect={() => onSelect(tab.source.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Single browser tab row */
function BrowserTabRow({
  tab,
  isSelected,
  onSelect,
}: {
  tab: ParsedBrowserTab
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-all outline-none"
      style={{
        backgroundColor: isSelected
          ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
          : 'transparent',
        border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
      }}
    >
      <img
        src={tab.source.thumbnailDataUrl}
        alt={tab.tabTitle}
        className="w-[72px] h-[40px] rounded object-cover shrink-0"
        style={{ backgroundColor: '#000', border: '1px solid var(--border)' }}
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-[12px] leading-tight line-clamp-2 font-medium"
          style={{ color: 'var(--text)' }}
        >
          {tab.tabTitle}
        </div>
      </div>
    </button>
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

/** List row for non-browser windows */
function WindowRow({
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
      className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-all outline-none"
      style={{
        backgroundColor: isSelected
          ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
          : 'transparent',
        border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
      }}
    >
      <img
        src={source.thumbnailDataUrl}
        alt={source.name}
        className="w-[72px] h-[40px] rounded object-cover shrink-0"
        style={{ backgroundColor: '#000', border: '1px solid var(--border)' }}
      />
      <span
        className="text-[12px] leading-tight line-clamp-2"
        style={{ color: 'var(--text)' }}
      >
        {source.name}
      </span>
    </button>
  )
}

/** Grid card for screens */
function ScreenCard({
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
