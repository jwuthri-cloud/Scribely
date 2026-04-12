import { useState, useCallback } from 'react'
import { RecordingBar } from './RecordingBar'
import { TranscriptView } from './TranscriptView'
import { useAudioCapture } from '../hooks/useAudioCapture'
import { useMeetingTranscript } from '../hooks/useMeetingTranscript'
import { useMeetingRecorder } from '../hooks/useMeetingRecorder'

/**
 * Main container for the meeting transcription mode.
 * Orchestrates audio capture, transcription, and recording.
 */
export function MeetingView() {
  const capture = useAudioCapture()
  const transcript = useMeetingTranscript()
  const recorder = useMeetingRecorder()
  const [error, setError] = useState<string | null>(null)

  const handleStart = useCallback(async () => {
    setError(null)

    // 1. Start audio capture (tab picker + mic)
    const { micStream, tabStream } = await capture.startCapture({
      mic: true,
      tab: true,
    })

    if (!micStream && !tabStream) {
      setError('No audio source available. Please allow mic/screen access.')
      return
    }

    // 2. Start transcription session in main process
    await transcript.startSession()

    // 3. Start recording (main process handles screen/tab capture)
    await recorder.startRecording()
  }, [capture, transcript, recorder])

  const handleStop = useCallback(async () => {
    // Stop in reverse order
    capture.stopCapture()

    const filepath = await recorder.stopRecording()
    if (filepath) {
      console.log('[meeting] Recording saved:', filepath)
    }

    await transcript.stopSession()
  }, [capture, recorder, transcript])

  const displayError = error || capture.error || recorder.error

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <RecordingBar
        isActive={transcript.status.isActive}
        isRecording={recorder.isRecording}
        formattedDuration={recorder.formattedDuration}
        transcriptionMode={transcript.status.transcriptionMode}
        micActive={capture.micActive}
        tabActive={capture.tabActive}
        onStart={handleStart}
        onStop={handleStop}
        modelDownloading={
          transcript.status.modelStatus.whisperModel.downloading
        }
        modelProgress={transcript.status.modelStatus.whisperModel.progress}
        onDownloadModel={transcript.downloadModel}
        modelAvailable={transcript.status.modelStatus.whisperModel.available}
      />

      {/* Separator */}
      <div
        className="mx-4 h-px shrink-0"
        style={{ backgroundColor: 'var(--border)', opacity: 0.5 }}
      />

      {/* Error banner */}
      {displayError && (
        <div
          className="mx-4 mt-2 text-xs px-2.5 py-1.5 rounded-lg"
          style={{
            backgroundColor: 'rgba(224, 108, 117, 0.15)',
            color: 'var(--error)',
          }}
        >
          {displayError}
        </div>
      )}

      <TranscriptView
        entries={transcript.entries}
        isActive={transcript.status.isActive}
      />
    </div>
  )
}
