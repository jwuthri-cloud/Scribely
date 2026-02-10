import { useState, useEffect, useCallback } from 'react'
import type { TranscriptEntry, MeetingStatus } from '../types/transcript'

/**
 * Manages meeting transcript state and communicates with the main process
 * audio pipeline for transcription.
 */
export function useMeetingTranscript() {
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [status, setStatus] = useState<MeetingStatus>({
    isActive: false,
    isTranscribing: false,
    transcriptionMode: 'local-fast',
    modelStatus: {
      whisperModel: {
        available: false,
        downloading: false,
        progress: 0,
      },
      vadModel: {
        available: false,
        downloading: false,
        progress: 0,
        ready: false,
      },
    },
  })

  // ── Listen for events from main process ──────────────
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const unsubEntry = api.onTranscriptEntry?.((entry: TranscriptEntry) => {
      setEntries((prev) => [...prev, entry])
    })

    const unsubStatus = api.onMeetingStatusUpdate?.(
      (update: Partial<MeetingStatus>) => {
        setStatus((prev) => ({ ...prev, ...update }))
      },
    )

    const unsubProgress = api.onModelProgress?.(
      (data: { modelId: string; progress: number }) => {
        setStatus((prev) => {
          if (data.modelId === 'silero-vad-v5') {
            return {
              ...prev,
              modelStatus: {
                ...prev.modelStatus,
                vadModel: {
                  ...prev.modelStatus.vadModel,
                  downloading: true,
                  progress: Math.max(prev.modelStatus.vadModel.progress, data.progress),
                },
              },
            }
          }
          return {
            ...prev,
            modelStatus: {
              ...prev.modelStatus,
              whisperModel: {
                ...prev.modelStatus.whisperModel,
                downloading: true,
                progress: Math.max(prev.modelStatus.whisperModel.progress, data.progress),
              },
            },
          }
        })
      },
    )

    const unsubComplete = api.onModelComplete?.(
      (data: { modelId: string; path: string }) => {
        setStatus((prev) => {
          if (data.modelId === 'silero-vad-v5') {
            return {
              ...prev,
              modelStatus: {
                ...prev.modelStatus,
                vadModel: {
                  available: true,
                  downloading: false,
                  progress: 100,
                  ready: true,
                },
              },
            }
          }
          return {
            ...prev,
            modelStatus: {
              ...prev.modelStatus,
              whisperModel: {
                ...prev.modelStatus.whisperModel,
                available: true,
                downloading: false,
                progress: 100,
              },
            },
          }
        })
      },
    )

    // Fetch initial model status
    api.getModelStatus?.().then((modelStatus: any) => {
      if (modelStatus) {
        setStatus((prev) => ({
          ...prev,
          modelStatus: {
            whisperModel: modelStatus.whisperModel || prev.modelStatus.whisperModel,
            vadModel: modelStatus.vadModel || prev.modelStatus.vadModel,
          },
        }))
      }
    })

    return () => {
      unsubEntry?.()
      unsubStatus?.()
      unsubProgress?.()
      unsubComplete?.()
    }
  }, [])

  // ── Start transcription session ──────────────────────
  const startSession = useCallback(async () => {
    const result = await window.electronAPI?.startMeetingSession?.()
    setStatus((prev) => ({
      ...prev,
      isActive: true,
      isTranscribing: true,
      transcriptionMode: result?.transcriptionMode || prev.transcriptionMode,
    }))
    setEntries([])
    return result
  }, [])

  // ── Stop transcription session ───────────────────────
  const stopSession = useCallback(async () => {
    await window.electronAPI?.stopMeetingSession?.()
    setStatus((prev) => ({
      ...prev,
      isActive: false,
      isTranscribing: false,
    }))
  }, [])

  const clearEntries = useCallback(() => {
    setEntries([])
  }, [])

  // ── Download local whisper model ─────────────────────
  const downloadModel = useCallback(async () => {
    setStatus((prev) => ({
      ...prev,
      modelStatus: {
        ...prev.modelStatus,
        whisperModel: {
          ...prev.modelStatus.whisperModel,
          downloading: true,
          progress: 0,
        },
      },
    }))

    const result = await window.electronAPI?.downloadWhisperModel?.()

    if (result?.success) {
      setStatus((prev) => ({
        ...prev,
        transcriptionMode: (result.mode as string) || prev.transcriptionMode,
        modelStatus: {
          ...prev.modelStatus,
          whisperModel: {
            available: true,
            downloading: false,
            progress: 100,
            path: result.path,
          },
        },
      }))
    } else {
      setStatus((prev) => ({
        ...prev,
        modelStatus: {
          ...prev.modelStatus,
          whisperModel: {
            ...prev.modelStatus.whisperModel,
            downloading: false,
            error: result?.error || 'Download failed',
          },
        },
      }))
    }

    return result
  }, [])

  return {
    entries,
    status,
    startSession,
    stopSession,
    clearEntries,
    downloadModel,
  }
}
