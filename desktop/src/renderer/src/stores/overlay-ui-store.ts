import { create } from 'zustand'
import { modelOptionsForProvider } from '../types/settings'
import type { FontSize } from '../types/settings'

export type OverlayViewId = 'chat' | 'llm' | 'settings' | 'insights' | 'sync'
export type OverlayAppPhase = 'loading' | 'auth' | 'onboarding' | 'app'

const DEFAULT_MODEL_OPTIONS = modelOptionsForProvider('openai').map((m) => ({
  id: m.id as string,
  label: m.label,
}))

export function formatMeetingDurationSeconds(meetingDurationSec: number): string {
  const h = Math.floor(meetingDurationSec / 3600)
  const m = Math.floor((meetingDurationSec % 3600) / 60)
  const s = meetingDurationSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export interface OverlayUiStore {
  visible: boolean
  phase: OverlayAppPhase
  view: OverlayViewId
  pendingScreenshots: string[]
  windowOpacity: number
  fontSize: FontSize
  compactMode: boolean
  currentModel: string
  summarizeInProgress: boolean
  summarizeFeedback: { type: 'success' | 'error'; message?: string } | null
  hasSummary: boolean
  showSummaryModal: boolean
  summaryContent: string | null
  quickActions: Array<{ label: string; value: string }>
  webSearchAvailable: boolean
  modelOptions: Array<{ id: string; label: string }>
  insightsPanelExpanded: boolean
  transcriptPanelExpanded: boolean
  syncBadgeCount: number
  excludeMyMic: boolean
  meetingError: string | null
  savedFiles: { recording?: string; transcript?: string } | null
  /** One-line notice shown as a dismissible banner (e.g. Recall unavailable on this device). */
  recallNotice: string | null
  /** Updated by MeetingDurationSync — subscribe in leaf components to avoid full-tree rerenders */
  meetingDurationFormatted: string

  setVisible: (v: boolean) => void
  setPhase: (p: OverlayAppPhase) => void
  setView: (v: OverlayViewId) => void
  setPendingScreenshots: (fn: (prev: string[]) => string[]) => void
  setWindowOpacity: (v: number) => void
  setFontSize: (v: FontSize) => void
  setCompactMode: (v: boolean) => void
  setCurrentModel: (v: string) => void
  setSummarizeInProgress: (v: boolean) => void
  setSummarizeFeedback: (v: { type: 'success' | 'error'; message?: string } | null) => void
  setHasSummary: (v: boolean) => void
  setShowSummaryModal: (v: boolean) => void
  setSummaryContent: (v: string | null) => void
  setQuickActions: (v: Array<{ label: string; value: string }>) => void
  setWebSearchAvailable: (v: boolean) => void
  setModelOptions: (v: Array<{ id: string; label: string }>) => void
  setInsightsPanelExpanded: (v: boolean) => void
  toggleInsightsPanel: () => void
  setTranscriptPanelExpanded: (v: boolean) => void
  toggleTranscriptPanel: () => void
  setSyncBadgeCount: (v: number) => void
  setExcludeMyMic: (v: boolean) => void
  setMeetingError: (v: string | null) => void
  setSavedFiles: (v: { recording?: string; transcript?: string } | null) => void
  setRecallNotice: (v: string | null) => void
  setMeetingDurationFormatted: (v: string) => void
}

export const useOverlayUiStore = create<OverlayUiStore>((set) => ({
  visible: true,
  phase: 'loading',
  view: 'chat',
  pendingScreenshots: [],
  windowOpacity: 1,
  fontSize: 'medium',
  compactMode: false,
  currentModel: 'gpt-5.6-terra',
  summarizeInProgress: false,
  summarizeFeedback: null,
  hasSummary: false,
  showSummaryModal: false,
  summaryContent: null,
  quickActions: [],
  webSearchAvailable: true,
  modelOptions: [...DEFAULT_MODEL_OPTIONS],
  insightsPanelExpanded: false,
  transcriptPanelExpanded: false,
  syncBadgeCount: 0,
  excludeMyMic: false,
  meetingError: null,
  savedFiles: null,
  recallNotice: null,
  meetingDurationFormatted: '0:00',

  setVisible: (visible) => set({ visible }),
  setPhase: (phase) => set({ phase }),
  setView: (view) => set({ view }),
  setPendingScreenshots: (fn) => set((s) => ({ pendingScreenshots: fn(s.pendingScreenshots) })),
  setWindowOpacity: (windowOpacity) => set({ windowOpacity }),
  setFontSize: (fontSize) => set({ fontSize }),
  setCompactMode: (compactMode) => set({ compactMode }),
  setCurrentModel: (currentModel) => set({ currentModel }),
  setSummarizeInProgress: (summarizeInProgress) => set({ summarizeInProgress }),
  setSummarizeFeedback: (summarizeFeedback) => set({ summarizeFeedback }),
  setHasSummary: (hasSummary) => set({ hasSummary }),
  setShowSummaryModal: (showSummaryModal) => set({ showSummaryModal }),
  setSummaryContent: (summaryContent) => set({ summaryContent }),
  setQuickActions: (quickActions) => set({ quickActions }),
  setWebSearchAvailable: (webSearchAvailable) => set({ webSearchAvailable }),
  setModelOptions: (modelOptions) => set({ modelOptions }),
  setInsightsPanelExpanded: (insightsPanelExpanded) => set({ insightsPanelExpanded }),
  toggleInsightsPanel: () => set((s) => ({ insightsPanelExpanded: !s.insightsPanelExpanded })),
  setTranscriptPanelExpanded: (transcriptPanelExpanded) => set({ transcriptPanelExpanded }),
  toggleTranscriptPanel: () => set((s) => ({ transcriptPanelExpanded: !s.transcriptPanelExpanded })),
  setSyncBadgeCount: (syncBadgeCount) => set({ syncBadgeCount }),
  setExcludeMyMic: (excludeMyMic) => set({ excludeMyMic }),
  setMeetingError: (meetingError) => set({ meetingError }),
  setSavedFiles: (savedFiles) => set({ savedFiles }),
  setRecallNotice: (recallNotice) => set({ recallNotice }),
  setMeetingDurationFormatted: (meetingDurationFormatted) => set({ meetingDurationFormatted }),
}))
