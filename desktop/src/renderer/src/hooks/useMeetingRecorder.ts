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
export function useMeetingRecorder(excludeMyMic = false) {
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
  const micStreamRef = useRef<MediaStream | null>(null)
  const mixerCtxRef = useRef<AudioContext | null>(null)
  const micGainRef = useRef<GainNode | null>(null)

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
        if (!hasAudio) {
          console.warn(
            '[recorder] No system audio in display stream — recording will only have mic. ' +
              'Ensure "Screen & System Audio Recording" permission is granted to Electron in macOS Privacy settings.',
          )
        }

        // ── Mix mic audio into the recording ──────────────
        let recordingStream = stream
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          micStreamRef.current = micStream

          const mixerCtx = new AudioContext()
          mixerCtxRef.current = mixerCtx
          if (mixerCtx.state === 'suspended') await mixerCtx.resume()

          const dest = mixerCtx.createMediaStreamDestination()

          // Connect display/system audio if present
          if (hasAudio) {
            const displaySource = mixerCtx.createMediaStreamSource(
              new MediaStream(stream.getAudioTracks()),
            )
            displaySource.connect(dest)
          }

          // Connect mic audio through GainNode (allows muting during recording)
          const micSource = mixerCtx.createMediaStreamSource(micStream)
          const micGain = mixerCtx.createGain()
          micGain.gain.value = excludeMyMic ? 0 : 1
          micGainRef.current = micGain
          micSource.connect(micGain)
          micGain.connect(dest)

          // Keep AudioContext alive
          const silencer = mixerCtx.createGain()
          silencer.gain.value = 0
          micSource.connect(silencer)
          silencer.connect(mixerCtx.destination)

          // New stream: mixed audio + display video
          recordingStream = new MediaStream([
            ...dest.stream.getAudioTracks(),
            ...stream.getVideoTracks(),
          ])

          console.log('[recorder] Mic mixed into recording stream')
        } catch (micErr) {
          console.warn('[recorder] Mic capture failed, recording without mic:', micErr)
        }

        // Pick mime type based on available tracks
        const recTracks = recordingStream.getTracks()
        const recHasVideo = recTracks.some((t) => t.kind === 'video')
        const recHasAudio = recTracks.some((t) => t.kind === 'audio')

        let mimeType: string
        if (recHasVideo && recHasAudio) {
          mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : 'video/webm'
        } else if (recHasVideo) {
          mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm'
        } else {
          mimeType = 'audio/webm;codecs=opus'
        }

        const recorder = new MediaRecorder(recordingStream, {
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
  }, [excludeMyMic])

  // Update mic gain when excludeMyMic changes during recording
  useEffect(() => {
    const gain = micGainRef.current
    if (gain) {
      gain.gain.value = excludeMyMic ? 0 : 1
    }
  }, [excludeMyMic])

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

    // Clean up mic stream & mixer
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    micGainRef.current = null
    mixerCtxRef.current?.close().catch(() => {})
    mixerCtxRef.current = null

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

  /** User dismissed the picker — cancel recording and notify main process */
  const dismissPicker = useCallback(async () => {
    setPickerSources(null)
    await window.electronAPI?.cancelRecording?.()
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
