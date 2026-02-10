import { useState, useEffect, useCallback, useRef } from 'react'
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
    lastSavedCount.current = 0
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

  // ── Auto-save transcript to disk (debounced, every 10s) ──
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedCount = useRef(0)

  useEffect(() => {
    if (!status.isActive || entries.length === 0) return
    // Only save if we have new entries since last save
    if (entries.length === lastSavedCount.current) return

    // Debounce: wait 10s after last new entry before saving
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await window.electronAPI?.saveTranscript?.({
          entries: entries.map((e) => ({
            id: e.id,
            speaker: e.speaker,
            text: e.text,
            startTime: e.startTime,
            endTime: e.endTime,
            source: e.source || 'unknown',
          })),
        })
        lastSavedCount.current = entries.length
        console.log(`[transcript] Auto-saved ${entries.length} entries`)
      } catch (err) {
        console.error('[transcript] Auto-save failed:', err)
      }
    }, 10_000)

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [entries, status.isActive])

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
