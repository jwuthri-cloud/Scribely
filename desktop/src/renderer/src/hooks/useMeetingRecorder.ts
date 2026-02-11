import { useState, useRef, useCallback, useEffect } from 'react'

export interface SourceInfo {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnailDataUrl: string
}

interface RecorderState {
  isRecording: boolean
  duration: number
  error: string | null
  filepath: string | null
}

/**
 * Records the meeting screen.
 *
 * Flow:
 * 1. Overlay calls startRecording() → IPC to main
 * 2. Main lists sources, sends 'recording:show-picker' with thumbnails
 * 3. We show a picker UI, user picks a source
 * 4. We call selectRecordingSource(id) → main installs handler, sends 'recording:start-capture'
 * 5. We call getDisplayMedia() — handler auto-selects the chosen source
 * 6. MediaRecorder sends chunks to main for incremental disk writes
 * 7. On stop, main sends 'recording:stop-capture'
 */
export function useMeetingRecorder() {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    duration: 0,
    error: null,
    filepath: null,
  })

  // Picker state
  const [pickerSources, setPickerSources] = useState<SourceInfo[] | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)

  // Listen for main process signals
  useEffect(() => {
    // Main sends available sources for the picker
    const unsubPicker = window.electronAPI?.onShowPicker?.((data) => {
      console.log(`[recorder] Got show-picker signal (${data.sources.length} sources)`)
      setPickerSources(data.sources)
    })

    // Main says "go ahead and call getDisplayMedia now" (handler is installed for chosen source)
    const unsubStart = window.electronAPI?.onStartCapture?.(async (data) => {
      console.log('[recorder] Got start-capture signal')
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })

        streamRef.current = stream

        const tracks = stream.getTracks()
        const hasVideo = tracks.some((t) => t.kind === 'video')
        const hasAudio = tracks.some((t) => t.kind === 'audio')
        console.log(
          `[recorder] Stream: ${tracks.length} tracks (video=${hasVideo}, audio=${hasAudio})`,
        )

        // Pick mime type based on available tracks
        let mimeType: string
        if (hasVideo && hasAudio) {
          mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : 'video/webm'
        } else if (hasVideo) {
          mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm'
        } else {
          mimeType = 'audio/webm;codecs=opus'
        }

        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 2_500_000,
        })

        recorder.ondataavailable = async (e) => {
          if (e.data.size > 0) {
            try {
              const buf = await e.data.arrayBuffer()
              await window.electronAPI?.writeRecordingChunk?.({ data: new Uint8Array(buf) })
            } catch (err) {
              console.error('[recorder] Failed to send chunk:', err)
            }
          }
        }

        recorder.onerror = (e) => {
          console.error('[recorder] MediaRecorder error:', e)
        }

        recorder.start(5000)
        mediaRecorderRef.current = recorder
        startTimeRef.current = Date.now()

        timerRef.current = setInterval(() => {
          setState((prev) => ({
            ...prev,
            duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
          }))
        }, 1000)

        setState({
          isRecording: true,
          duration: 0,
          error: null,
          filepath: data.filepath,
        })

        console.log(`[recorder] MediaRecorder started (${mimeType})`)
      } catch (err) {
        console.error('[recorder] Failed to start capture:', err)
        setState((prev) => ({ ...prev, error: 'Failed to start screen recording' }))
      }
    })

    const unsubStop = window.electronAPI?.onStopCapture?.(() => {
      console.log('[recorder] Got stop-capture signal')
      stopInternal()
    })

    return () => {
      unsubPicker?.()
      unsubStart?.()
      unsubStop?.()
    }
  }, [])

  const stopInternal = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        console.log('[recorder] MediaRecorder stopped, cleaning up stream')
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      try {
        recorder.requestData()
      } catch {
        // ignore if no data buffered
      }
      recorder.stop()
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null

    setState((prev) => ({ ...prev, isRecording: false, duration: 0 }))
  }, [])

  const startRecording = useCallback(async () => {
    const result = await window.electronAPI?.startRecording?.()
    if (!result?.success) {
      setState((prev) => ({
        ...prev,
        error: result?.error || 'Failed to start recording',
      }))
    }
  }, [])

  /** User picked a source from the picker */
  const selectSource = useCallback(async (sourceId: string) => {
    setPickerSources(null)
    await window.electronAPI?.selectRecordingSource?.(sourceId)
  }, [])

  /** User dismissed the picker */
  const dismissPicker = useCallback(() => {
    setPickerSources(null)
  }, [])

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const result = await window.electronAPI?.stopRecording?.()
    stopInternal()
    return result?.filepath || null
  }, [stopInternal])

  const formatDuration = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${m}:${String(s).padStart(2, '0')}`
  }, [])

  return {
    ...state,
    formattedDuration: formatDuration(state.duration),
    startRecording,
    stopRecording,
    // Picker
    pickerSources,
    selectSource,
    dismissPicker,
  }
}
