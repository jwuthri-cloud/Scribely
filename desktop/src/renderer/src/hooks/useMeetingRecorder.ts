import { useState, useRef, useCallback, useEffect } from 'react'

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
 * 2. Main creates file, sends 'recording:start-capture' back
 * 3. We call getDisplayMedia() — main's handler auto-selects the screen (no picker)
 * 4. MediaRecorder sends chunks to main for incremental disk writes
 * 5. On stop, main sends 'recording:stop-capture'
 */
export function useMeetingRecorder() {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    duration: 0,
    error: null,
    filepath: null,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)

  // Listen for main process signals
  useEffect(() => {
    const unsubStart = window.electronAPI?.onStartCapture?.(async (data) => {
      console.log('[recorder] Got start-capture signal')
      try {
        // getDisplayMedia triggers setDisplayMediaRequestHandler in main
        // which shows the system picker so user can choose which tab/window to record
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })

        streamRef.current = stream

        const tracks = stream.getTracks()
        const hasVideo = tracks.some((t) => t.kind === 'video')
        const hasAudio = tracks.some((t) => t.kind === 'audio')
        console.log(`[recorder] Stream: ${tracks.length} tracks (video=${hasVideo}, audio=${hasAudio})`)

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
              await window.electronAPI?.writeRecordingChunk?.({ data: buf })
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
      recorder.stop()
    }
    mediaRecorderRef.current = null

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

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
  }
}
