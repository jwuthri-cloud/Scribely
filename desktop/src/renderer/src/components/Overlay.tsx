import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TitleBar } from './TitleBar'
import { ResponseCard } from './ResponseCard'
import { ActionChips } from './ActionChips'
import { InputBar } from './InputBar'
import { SettingsView } from './SettingsView'
import { LLMView } from './LLMView'
import { OnboardingView } from './OnboardingView'
import { LiveTranscriptPanel } from './LiveTranscriptPanel'
import { useChat } from '../hooks/useChat'
import { useWhisperSTT } from '../hooks/useWhisperSTT'
import { useAudioCapture } from '../hooks/useAudioCapture'
import { useMeetingTranscript } from '../hooks/useMeetingTranscript'
import { useMeetingRecorder } from '../hooks/useMeetingRecorder'
import { SourcePicker } from './SourcePicker'
import { MarkdownContent } from './MarkdownContent'
import type { ChatAttachment } from '../types'
import type { ModelId } from '../types/settings'
import { FONT_SIZE_VALUES, type FontSize } from '../types/settings'

type ViewId = 'chat' | 'llm' | 'settings'

function SummaryModal({ content, onClose }: { content: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    const text = content ?? 'No summary available.'
    await window.electronAPI?.clipboardWriteText?.(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [content])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-modal-title"
    >
      <div
        className="rounded-xl border shadow-xl max-w-lg w-full max-h-[70vh] overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 id="summary-modal-title" className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Transcript Summary
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="px-2 py-1 rounded-lg text-xs font-medium hover:bg-[var(--surface-hover)] flex items-center gap-1.5"
              style={{ color: 'var(--text-muted)' }}
            >
              {copied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy summary
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div
          className="flex-1 overflow-y-auto p-4 text-[13px] leading-relaxed"
          style={{ color: 'var(--text)' }}
        >
          {content ? (
            <MarkdownContent content={content} />
          ) : (
            <span className="whitespace-pre-wrap">No summary available.</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function Overlay() {
  const [visible, setVisible] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(true)
  const [view, setView] = useState<ViewId>('chat')
  const [pendingScreenshot, setPendingScreenshot] = useState<string | null>(null)
  const [windowOpacity, setWindowOpacity] = useState(1)
  const [fontSize, setFontSize] = useState<FontSize>('medium')
  const [currentModel, setCurrentModel] = useState<ModelId>('gpt-5.2')
  const [summarizeInProgress, setSummarizeInProgress] = useState(false)
  const [summarizeFeedback, setSummarizeFeedback] = useState<{
    type: 'success' | 'error'
    message?: string
  } | null>(null)
  const [hasSummary, setHasSummary] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [summaryContent, setSummaryContent] = useState<string | null>(null)
  const [quickActions, setQuickActions] = useState<Array<{ label: string; value: string }>>([])
  const stt = useWhisperSTT()

  // ── Meeting hooks (live inside the chat view) ─────────
  const capture = useAudioCapture()
  const transcript = useMeetingTranscript()
  const recorder = useMeetingRecorder()
  const [meetingError, setMeetingError] = useState<string | null>(null)

  // Pass transcript entries to useChat so it can embed deltas in user messages
  const { messages, isLoading, sendMessage, resetChat, stopGeneration, contextUsage } = useChat({
    transcriptEntries: transcript.entries,
  })

  // ── Onboarding: show wizard on first run ─────────────────
  useEffect(() => {
    window.electronAPI?.onboardingGetCompleted?.().then((completed) => {
      setShowOnboarding(!completed)
    })
  }, [])

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false)
  }, [])

  const handleReRunSetup = useCallback(async () => {
    await window.electronAPI?.onboardingSetCompleted?.(false)
    setShowOnboarding(true)
  }, [])

  // ── Load current model ──
  useEffect(() => {
    window.electronAPI?.llmGetModel().then((m) => setCurrentModel(m as ModelId))
  }, [])

  // ── Load summarization status ──
  useEffect(() => {
    window.electronAPI?.llmGetSummarizationStatus?.().then((s) => {
      if (s) setHasSummary(s.hasSummary)
    })
  }, [summarizeFeedback])

  // ── Load quick actions ──
  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      if (s?.llm?.quickActions) setQuickActions(s.llm.quickActions)
    })
  }, [])
  useEffect(() => {
    const unsub = window.electronAPI?.onSettingsChanged?.((s) => {
      if (s?.llm?.quickActions) setQuickActions(s.llm.quickActions)
    })
    return () => unsub?.()
  }, [])

  // ── Listen for background summarization completion (Phase 2) ──
  useEffect(() => {
    const unsub = window.electronAPI?.onLLMSummaryUpdated?.(() => {
      setHasSummary(true)
      setSummarizeFeedback({ type: 'success' })
      setTimeout(() => setSummarizeFeedback(null), 5000)
    })
    return () => unsub?.()
  }, [])

  const handleModelChange = useCallback(async (modelId: ModelId) => {
    const result = await window.electronAPI?.llmSetModel(modelId)
    if (result?.success) {
      setCurrentModel(modelId)
    }
  }, [])

  const handleSummarizeTranscript = useCallback(async () => {
    setSummarizeInProgress(true)
    setSummarizeFeedback(null)
    try {
      const entries = transcript.entries.map((e) => ({
        id: e.id,
        speaker: e.speaker,
        text: e.text,
        startTime: e.startTime,
        endTime: e.endTime,
        source: e.source,
      }))
      const result = await window.electronAPI?.llmTriggerSummarize?.({
        transcriptEntries: entries,
      })
      if (result?.success) {
        setSummarizeFeedback({ type: 'success' })
        setHasSummary(true)
      } else {
        setSummarizeFeedback({
          type: 'error',
          message: result?.error ?? 'Summarization failed',
        })
      }
      setTimeout(() => setSummarizeFeedback(null), 5000)
    } catch (err: any) {
      setSummarizeFeedback({
        type: 'error',
        message: err?.message ?? 'Summarization failed',
      })
      setTimeout(() => setSummarizeFeedback(null), 5000)
    } finally {
      setSummarizeInProgress(false)
    }
  }, [transcript.entries])

  // ── Window opacity & font size ──
  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      if (s?.windowOpacity !== undefined) setWindowOpacity(s.windowOpacity)
      if (s?.fontSize) setFontSize(s.fontSize)
    })
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onSettingsChanged((s) => {
      if (s?.windowOpacity !== undefined) setWindowOpacity(s.windowOpacity)
      if (s?.fontSize) setFontSize(s.fontSize)
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  // Toggle visibility from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onToggleVisibility((v) => {
      setVisible(v)
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  // Screenshot from hotkey
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onScreenshotTaken((dataUrl) => {
      setPendingScreenshot(dataUrl)
      if (view !== 'chat') setView('chat')
    })
    return () => {
      unsubscribe?.()
    }
  }, [view])

  // Audio toggle from hotkey
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onToggleAudio(() => {
      stt.toggleRecording()
    })
    return () => {
      unsubscribe?.()
    }
  }, [stt.toggleRecording])

  // ── Meeting start/stop ────────────────────────────────
  const handleStartMeeting = useCallback(async () => {
    // Guard against double-start (e.g. manual click + auto-start from extension)
    if (transcript.status.isActive) return

    setMeetingError(null)

    // Start the transcription session FIRST so the pipeline is active
    // before any audio frames arrive (especially important for native capture
    // which starts sending frames immediately).
    await transcript.startSession()

    const { mode } = await capture.startCapture({
      mic: true,
      tab: true,
    })

    if (mode === 'idle') {
      setMeetingError('No audio source available. Allow mic/screen access.')
      await transcript.stopSession()
      return
    }

    // In extension mode, video comes from the Chrome extension over WebSocket —
    // skip the Electron screen recorder (which would trigger the macOS source picker).
    if (mode !== 'extension') {
      await recorder.startRecording()
    }
  }, [capture, transcript, recorder])

  const [savedFiles, setSavedFiles] = useState<{ recording?: string; transcript?: string } | null>(null)

  const handleStopMeeting = useCallback(async () => {
    if (!transcript.status.isActive) return

    // Capture entries before anything gets cleared
    const currentEntries = [...transcript.entries]
    const wasExtensionMode = capture.captureMode === 'extension'

    await capture.stopCapture()

    // In extension mode, tell the extension to stop capturing and skip
    // the Electron screen recorder (it was never started).
    let recordingPath: string | null | undefined
    if (wasExtensionMode) {
      // Signal the extension to stop via the WS server
      await window.electronAPI?.stopExtensionCapture?.()
    } else {
      recordingPath = await recorder.stopRecording()
    }

    // Save final transcript to disk (with recording path link)
    let transcriptPath: string | undefined
    if (currentEntries.length > 0) {
      try {
        const result = await window.electronAPI?.saveTranscript?.({
          entries: currentEntries.map((e) => ({
            id: e.id,
            speaker: e.speaker,
            text: e.text,
            startTime: e.startTime,
            endTime: e.endTime,
            source: e.source || 'unknown',
          })),
          recordingFilepath: recordingPath ?? undefined,
        })
        transcriptPath = result?.filepath
        if (transcriptPath) {
          console.log(`[overlay] Transcript saved: ${transcriptPath}`)
        }
      } catch (err) {
        console.error('[overlay] Failed to save transcript:', err)
      }
    }

    await transcript.stopSession()
    setMeetingError(null)

    // Show save notification
    if (recordingPath || transcriptPath) {
      setSavedFiles({
        recording: recordingPath ?? undefined,
        transcript: transcriptPath,
      })
      // Auto-dismiss after 6 seconds
      setTimeout(() => setSavedFiles(null), 6000)
    }
  }, [capture, recorder, transcript])

  const handleToggleMeeting = useCallback(() => {
    if (transcript.status.isActive) {
      handleStopMeeting()
    } else {
      handleStartMeeting()
    }
  }, [transcript.status.isActive, handleStartMeeting, handleStopMeeting])

  // Meeting toggle from hotkey
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onToggleMeeting(() => {
      handleToggleMeeting()
    })
    return () => {
      unsubscribe?.()
    }
  }, [handleToggleMeeting])

  // ── Auto-start/stop meeting when Chrome extension connects/disconnects ──
  useEffect(() => {
    const unsubStart = window.electronAPI?.onExtensionAutoStartMeeting?.(() => {
      if (!transcript.status.isActive) {
        console.log('[overlay] Extension connected — auto-starting meeting')
        handleStartMeeting()
      }
    })
    const unsubStop = window.electronAPI?.onExtensionAutoStopMeeting?.(() => {
      if (transcript.status.isActive) {
        console.log('[overlay] Extension disconnected — auto-stopping meeting')
        handleStopMeeting()
      }
    })
    return () => {
      unsubStart?.()
      unsubStop?.()
    }
  }, [transcript.status.isActive, handleStartMeeting, handleStopMeeting])

  // ── Chat handlers ─────────────────────────────────────
  const handleSend = useCallback(
    (content: string, attachments?: ChatAttachment[]) => {
      sendMessage(content, attachments)
      setPendingScreenshot(null)
    },
    [sendMessage],
  )

  const handleScreenshot = useCallback(async () => {
    try {
      const dataUrl = await window.electronAPI?.takeScreenshot()
      if (dataUrl) {
        setPendingScreenshot(dataUrl)
      }
    } catch (err) {
      console.error('Screenshot failed:', err)
    }
  }, [])

  const handleSetView = useCallback((v: ViewId) => {
    setView(v)
  }, [])

  const handleReset = useCallback(() => {
    resetChat()
    setTimeout(() => {
      window.electronAPI?.llmGetSummarizationStatus?.().then((s) => {
        if (s) setHasSummary(s.hasSummary)
      })
    }, 100)
  }, [resetChat])

  const handleViewSummary = useCallback(async () => {
    const summary = await window.electronAPI?.llmGetSummary?.()
    setSummaryContent(summary ?? null)
    setShowSummaryModal(true)
  }, [])

  const meetingActive = transcript.status.isActive

  // Close summary modal on Escape
  useEffect(() => {
    if (!showSummaryModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSummaryModal(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showSummaryModal])

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass w-full h-screen flex flex-col rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: 'var(--overlay)',
            borderColor: 'var(--border)',
            opacity: windowOpacity,
            ...Object.fromEntries(
              Object.entries(FONT_SIZE_VALUES[fontSize]).map(([k, v]) => [
                `--font-size-${k}`,
                v,
              ]),
            ),
          } as React.CSSProperties}
        >
          {showOnboarding ? (
            <OnboardingView onComplete={handleOnboardingComplete} />
          ) : (
            <>
              <TitleBar
                view={view}
                onSetView={handleSetView}
                onReset={handleReset}
                meetingActive={meetingActive}
                onToggleMeeting={handleToggleMeeting}
              />

              {/* Subtle separator */}
              <div
                className="mx-4 h-px shrink-0"
                style={{ backgroundColor: 'var(--border)', opacity: 0.5 }}
              />

              {view === 'chat' && (
            <>
              {/* Live transcript panel — visible when meeting is active */}
              {meetingActive && (
                <LiveTranscriptPanel
                  entries={transcript.entries}
                  isActive={meetingActive}
                  isRecording={recorder.isRecording}
                  formattedDuration={recorder.formattedDuration}
                  transcriptionMode={transcript.status.transcriptionMode}
                  micActive={capture.micActive}
                  tabActive={capture.tabActive}
                  onStop={handleStopMeeting}
                  error={meetingError || capture.error || recorder.error}
                  modelDownloading={transcript.status.modelStatus?.whisperModel?.downloading}
                  modelProgress={transcript.status.modelStatus?.whisperModel?.progress}
                  captureMode={capture.captureMode}
                  nativeAvailable={capture.nativeAvailable}
                  extensionConnected={capture.extensionConnected}
                />
              )}

              {/* Save notification after meeting ends */}
              {savedFiles && (
                <div
                  className="mx-3 mb-2 px-3 py-2 rounded-xl text-[11px] space-y-0.5"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
                    color: 'var(--text)',
                  }}
                >
                  <div className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--success)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Meeting saved
                  </div>
                  {savedFiles.recording && (
                    <div style={{ color: 'var(--text-muted)' }}>
                      Recording: {savedFiles.recording.split('/').slice(-2).join('/')}
                    </div>
                  )}
                  {savedFiles.transcript && (
                    <div style={{ color: 'var(--text-muted)' }}>
                      Transcript: {savedFiles.transcript.split('/').slice(-2).join('/')}
                    </div>
                  )}
                </div>
              )}

              <ResponseCard messages={messages} isLoading={isLoading} onSend={handleSend} />

              {/* Summarize feedback */}
              {summarizeFeedback && (
                <div
                  className={`mx-4 mb-2 px-3 py-2 rounded-xl text-[11px] flex items-center gap-1.5 ${
                    summarizeFeedback.type === 'success' ? 'cursor-pointer hover:brightness-110' : ''
                  }`}
                  style={{
                    backgroundColor:
                      summarizeFeedback.type === 'success'
                        ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                        : 'color-mix(in srgb, var(--error) 12%, transparent)',
                    border: `1px solid color-mix(in srgb, var(--${summarizeFeedback.type}) 25%, transparent)`,
                    color: summarizeFeedback.type === 'success' ? 'var(--success)' : 'var(--error)',
                  }}
                  onClick={
                    summarizeFeedback.type === 'success' ? handleViewSummary : undefined
                  }
                >
                  {summarizeFeedback.type === 'success' ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M20 6L9 17l-5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Summary ready — click to view
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      {summarizeFeedback.message}
                    </>
                  )}
                </div>
              )}

              <ActionChips
                onAction={(action) => {
                  const attachments: ChatAttachment[] = []
                  if (pendingScreenshot) {
                    attachments.push({ type: 'image', data: pendingScreenshot, label: 'Screenshot' })
                  }
                  handleSend(action, attachments.length > 0 ? attachments : undefined)
                }}
                onSummarizeTranscript={handleSummarizeTranscript}
                summarizeInProgress={summarizeInProgress}
                hasSummary={hasSummary}
                onViewSummary={handleViewSummary}
                customActions={quickActions.length > 0 ? quickActions : undefined}
              />

              {/* Summary modal */}
              {showSummaryModal && (
                <SummaryModal
                  content={summaryContent}
                  onClose={() => setShowSummaryModal(false)}
                />
              )}
              {/* Context utilization indicator */}
              {contextUsage && contextUsage.contextWindow > 0 && (
                <div
                  className="mx-4 mb-1 px-2 py-1 rounded-lg flex items-center justify-between"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--surface) 80%, transparent)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    Context
                  </span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-1.5 rounded-full overflow-hidden flex-1 min-w-[60px] max-w-[100px]"
                      style={{ backgroundColor: 'var(--border)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            (contextUsage.promptTokens / contextUsage.contextWindow) * 100,
                          )}%`,
                          backgroundColor:
                            contextUsage.promptTokens / contextUsage.contextWindow > 0.8
                              ? 'var(--error)'
                              : 'var(--accent)',
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      {(contextUsage.promptTokens / 1000).toFixed(1)}k /{' '}
                      {(contextUsage.contextWindow / 1000).toFixed(0)}k
                    </span>
                  </div>
                </div>
              )}

              <InputBar
                onSend={handleSend}
                disabled={isLoading}
                isLoading={isLoading}
                onStop={stopGeneration}
                onScreenshot={handleScreenshot}
                pendingScreenshot={pendingScreenshot}
                onClearScreenshot={() => setPendingScreenshot(null)}
                isRecording={stt.isRecording}
                onToggleRecording={stt.toggleRecording}
                sttTranscript={stt.transcript}
                onClearTranscript={stt.clearTranscript}
                micLevel={stt.micLevel}
                modelDownloading={transcript.status.modelStatus?.whisperModel?.downloading}
                modelProgress={transcript.status.modelStatus?.whisperModel?.progress}
                currentModel={currentModel}
                onModelChange={handleModelChange}
              />
            </>
          )}
              {view === 'llm' && <LLMView />}
              {view === 'settings' && <SettingsView onReRunSetup={handleReRunSetup} />}

              {/* Source picker overlay */}
              {recorder.pickerSources && (
                <SourcePicker
                  sources={recorder.pickerSources}
                  onSelect={recorder.selectSource}
                  onDismiss={async () => {
                    await recorder.dismissPicker()
                    handleStopMeeting()
                  }}
                />
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
