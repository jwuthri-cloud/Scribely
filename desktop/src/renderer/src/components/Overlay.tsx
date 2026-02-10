import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TitleBar } from './TitleBar'
import { ResponseCard } from './ResponseCard'
import { ActionChips } from './ActionChips'
import { InputBar } from './InputBar'
import { SettingsView } from './SettingsView'
import { LiveTranscriptPanel } from './LiveTranscriptPanel'
import { useChat } from '../hooks/useChat'
import { useWhisperSTT } from '../hooks/useWhisperSTT'
import { useAudioCapture } from '../hooks/useAudioCapture'
import { useMeetingTranscript } from '../hooks/useMeetingTranscript'
import { useMeetingRecorder } from '../hooks/useMeetingRecorder'
import type { ChatAttachment } from '../types'

export function Overlay() {
  const [visible, setVisible] = useState(true)
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [pendingScreenshot, setPendingScreenshot] = useState<string | null>(null)
  const [windowOpacity, setWindowOpacity] = useState(1)
  const { messages, isLoading, sendMessage, resetChat, stopGeneration } = useChat()
  const stt = useWhisperSTT()

  // ── Meeting hooks (live inside the chat view) ─────────
  const capture = useAudioCapture()
  const transcript = useMeetingTranscript()
  const recorder = useMeetingRecorder()
  const [meetingError, setMeetingError] = useState<string | null>(null)

  // ── Window opacity (CSS-based since setOpacity is a no-op on transparent windows)
  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      if (s?.windowOpacity !== undefined) setWindowOpacity(s.windowOpacity)
    })
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onSettingsChanged((s) => {
      if (s?.windowOpacity !== undefined) setWindowOpacity(s.windowOpacity)
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
      if (view === 'settings') setView('chat')
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
    setMeetingError(null)

    const { micStream, tabStream } = await capture.startCapture({
      mic: true,
      tab: true,
    })

    if (!micStream && !tabStream) {
      setMeetingError('No audio source available. Allow mic/screen access.')
      return
    }

    await transcript.startSession()

    if (tabStream) {
      recorder.startRecording(tabStream, micStream)
    } else if (micStream) {
      recorder.startRecording(micStream)
    }
  }, [capture, transcript, recorder])

  const handleStopMeeting = useCallback(async () => {
    capture.stopCapture()
    await recorder.stopRecording()
    await transcript.stopSession()
    setMeetingError(null)
  }, [capture, recorder, transcript])

  const handleToggleMeeting = useCallback(() => {
    if (transcript.status.isActive) {
      handleStopMeeting()
    } else {
      handleStartMeeting()
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

  const toggleView = useCallback(() => {
    setView((v) => (v === 'chat' ? 'settings' : 'chat'))
  }, [])

  const meetingActive = transcript.status.isActive

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
          }}
        >
          <TitleBar
            view={view}
            onToggleView={toggleView}
            onReset={resetChat}
            meetingActive={meetingActive}
            onToggleMeeting={handleToggleMeeting}
          />

          {/* Subtle separator */}
          <div
            className="mx-4 h-px shrink-0"
            style={{ backgroundColor: 'var(--border)', opacity: 0.5 }}
          />

          {view === 'chat' ? (
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
                />
              )}

              <ResponseCard messages={messages} isLoading={isLoading} />
              <ActionChips onAction={(action) => handleSend(action)} />
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
                modelDownloading={transcript.status.modelStatus?.whisperModel?.downloading}
                modelProgress={transcript.status.modelStatus?.whisperModel?.progress}
              />
            </>
          ) : (
            <SettingsView />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
