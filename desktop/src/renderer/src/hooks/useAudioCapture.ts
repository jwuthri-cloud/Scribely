import { useState, useRef, useCallback, useEffect } from 'react'

const TARGET_SAMPLE_RATE = 16000

export type CaptureMode = 'extension' | 'hybrid' | 'browser' | 'idle'

interface NativeStatus {
  available: boolean
  connected: boolean
  processRunning: boolean
  captureState: string
  micActive: boolean
  systemAudioActive: boolean
}

/**
 * Dual-stream audio capture hook with hybrid native + browser support.
 *
 * When NativeHelper is connected (hybrid mode):
 *   - System audio is captured natively via SCStream (ScreenCaptureKit)
 *   - Mic is captured via browser getUserMedia (works with all devices
 *     including Bluetooth/AirPods without triggering HFP quality degradation)
 *   - PCM frames from both sources are streamed to main process for transcription
 *
 * When NativeHelper is unavailable (browser fallback):
 *   - Falls back to full browser-based capture (getUserMedia + getDisplayMedia)
 *   - Streams PCM frames to main process via IPC for VAD + transcription
 */
export function useAudioCapture() {
  const [isCapturing, setIsCapturing] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [tabActive, setTabActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('idle')
  const [nativeStatus, setNativeStatus] = useState<NativeStatus>({
    available: false,
    connected: false,
    processRunning: false,
    captureState: 'idle',
    micActive: false,
    systemAudioActive: false,
  })
  const [extensionConnected, setExtensionConnected] = useState(false)

  const micStreamRef = useRef<MediaStream | null>(null)
  const tabStreamRef = useRef<MediaStream | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const tabContextRef = useRef<AudioContext | null>(null)
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const tabProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const micCloneRef = useRef<MediaStream | null>(null)
  const tabCloneRef = useRef<MediaStream | null>(null)

  // ── Track native status from main process ──────────────
  useEffect(() => {
    window.electronAPI?.getNativeStatus?.().then((status) => {
      if (status) setNativeStatus(status)
    })

    const unsubStatus = window.electronAPI?.onNativeStatusChanged?.((status) => {
      setNativeStatus(status)
      if (status.captureState === 'capturing') {
        setMicActive(status.micActive)
        setTabActive(status.systemAudioActive)
      }
    })

    const unsubError = window.electronAPI?.onNativeError?.((err) => {
      console.error('[audio-capture] Native error:', err)
    })

    return () => {
      unsubStatus?.()
      unsubError?.()
    }
  }, [])

  // ── Track Chrome extension connection status ──────────
  useEffect(() => {
    window.electronAPI?.getExtensionStatus?.().then((status) => {
      if (status) setExtensionConnected(status.connected)
    })

    const unsub = window.electronAPI?.onExtensionStatusChanged?.((status) => {
      setExtensionConnected(status.connected)
    })

    return () => {
      unsub?.()
    }
  }, [])

  // ── Stream a single audio frame to main process ────────
  // All frames (including silent ones) are sent so the WAV recorder can
  // write continuous audio that stays in sync with the video.  The energy
  // gate that prevents Whisper hallucinations is applied in the main
  // process pipeline instead (before VAD, not here).
  const streamFrame = useCallback(
    (input: Float32Array, source: 'mic' | 'system') => {
      const copy = new Float32Array(input.length)
      copy.set(input)
      try {
        window.electronAPI?.streamAudioFrame({
          source,
          pcm: copy.buffer,
          sampleRate: TARGET_SAMPLE_RATE,
          timestamp: Date.now(),
        })
      } catch (err) {
        console.error(`[audio-capture] Failed to stream ${source} frame:`, err)
      }
    },
    [],
  )

  // ── Set up a PCM extractor on a MediaStream ──────────
  const createPcmExtractor = useCallback(
    async (
      stream: MediaStream,
      source: 'mic' | 'system',
    ): Promise<{ ctx: AudioContext; processor: ScriptProcessorNode }> => {
      let ctx: AudioContext
      try {
        ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
      } catch {
        ctx = new AudioContext()
      }

      if (ctx.state === 'suspended') {
        console.log(`[audio-capture] AudioContext suspended for ${source}, resuming…`)
        await ctx.resume()
      }

      const audioSource = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      const silencer = ctx.createGain()
      silencer.gain.value = 0

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        streamFrame(input, source)
      }

      audioSource.connect(processor)
      processor.connect(silencer)
      silencer.connect(ctx.destination)

      console.log(
        `[audio-capture] Streaming extractor ready for ${source} (rate=${ctx.sampleRate}, state=${ctx.state})`,
      )
      return { ctx, processor }
    },
    [streamFrame],
  )

  // ── Browser: start mic capture ────────────────────────
  // Request mic with no constraints — let the browser pick the best quality.
  // Forcing sampleRate/echoCancellation degrades Bluetooth audio quality.
  // The AudioContext in createPcmExtractor handles downsampling to 16kHz.
  const setupMicCapture = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

      micStreamRef.current = stream
      const clonedMicStream = new MediaStream(stream.getAudioTracks().map((t) => t.clone()))
      micCloneRef.current = clonedMicStream
      const { ctx, processor } = await createPcmExtractor(clonedMicStream, 'mic')
      micContextRef.current = ctx
      micProcessorRef.current = processor
      setMicActive(true)
      return stream
    } catch (err) {
      console.error('[audio-capture] Mic error:', err)
      setError('Microphone access denied')
      return null
    }
  }, [createPcmExtractor])

  // ── Browser: start tab/window capture via getDisplayMedia ─
  const setupTabCapture = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })

      tabStreamRef.current = stream

      const audioTracks = stream.getAudioTracks()
      const videoTracks = stream.getVideoTracks()
      console.log(
        `[audio-capture] Display media: ${audioTracks.length} audio, ${videoTracks.length} video`,
      )

      const bindStreamEnded = (activeStream: MediaStream) => {
        activeStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          setTabActive(false)
        })
      }

      if (audioTracks.length === 0) {
        const surface = videoTracks[0]?.getSettings?.().displaySurface || 'unknown'
        console.warn(
          `[audio-capture] No audio tracks for surface=${surface}. ` +
            'Window/app capture on macOS often lacks system audio — mic will still work.',
        )
      }

      bindStreamEnded(stream)
      setTabActive(true)

      if (audioTracks.length > 0) {
        const settings = audioTracks[0].getSettings()
        console.log('[audio-capture] Audio track settings:', JSON.stringify(settings))

        const clonedAudioTracks = audioTracks.map((t) => t.clone())
        const audioOnly = new MediaStream(clonedAudioTracks)
        tabCloneRef.current = audioOnly
        const { ctx, processor } = await createPcmExtractor(audioOnly, 'system')
        tabContextRef.current = ctx
        tabProcessorRef.current = processor
      }

      return stream
    } catch (err) {
      console.error('[audio-capture] Tab capture error:', err)
      const message =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: string }).name)
          : 'unknown'
      if (message === 'NotAllowedError') {
        setError(
          'Screen capture permission denied. Enable "Electron" in macOS Privacy > Screen & System Audio Recording, then restart app.',
        )
      } else if (message === 'NotSupportedError') {
        setError('Screen capture not supported in current mode. Restart app and try again.')
      } else {
        setError(`Screen capture failed (${message}). Please retry and allow sharing.`)
      }
      return null
    }
  }, [createPcmExtractor])

  // ── Public: start capture ─────────────────────────────
  // Priority order: extension → native → browser fallback.
  //
  // Extension mode (Chrome extension connected via WebSocket):
  //   - System audio + video → captured by Chrome extension, streamed over WS
  //   - Mic → browser getUserMedia (same as hybrid mode)
  //   - No macOS picker needed — Chrome handles tab selection
  //
  // Hybrid mode (native connected):
  //   - System audio → native SCStream (ScreenCaptureKit)
  //   - Mic → browser getUserMedia
  //
  // Browser fallback (nothing available):
  //   - Full browser-based capture (getUserMedia + getDisplayMedia)
  const startCapture = useCallback(
    async (options: { mic: boolean; tab: boolean }) => {
      setError(null)

      // Query live extension status
      const extStatus = await window.electronAPI?.getExtensionStatus?.()
      const extensionReady = extStatus?.connected
      console.log('[audio-capture] Extension status:', JSON.stringify(extStatus))

      // ── Extension path: Chrome extension handles tab audio + video ──
      if (extensionReady && options.tab) {
        console.log('[audio-capture] Extension mode — Chrome extension captures tab audio/video')

        // Tab audio is already streaming via WebSocket to AudioPipeline
        setTabActive(true)

        // Start browser mic capture with energy gate to suppress
        // ambient-noise frames that cause Whisper hallucinations.
        let micStream: MediaStream | null = null
        if (options.mic) {
          micStream = await setupMicCapture()
        }

        setCaptureMode('extension')
        setIsCapturing(true)
        return { micStream, tabStream: null, mode: 'extension' as CaptureMode }
      }

      // Query live native status — don't rely on React state which may be stale
      const liveStatus = await window.electronAPI?.getNativeStatus?.()
      const nativeReady = liveStatus?.available && liveStatus?.connected
      console.log('[audio-capture] Native status:', JSON.stringify(liveStatus))

      // ── Hybrid path: browser mic + native system audio ──
      if (nativeReady) {
        console.log('[audio-capture] Hybrid mode — browser mic + native system audio')

        // Start native capture for system audio ONLY (no mic)
        if (options.tab) {
          const result = await window.electronAPI?.startNativeCapture({
            mic: false,
            system: true,
          })
          console.log('[audio-capture] startNativeCapture (system only) result:', JSON.stringify(result))

          if (result?.success) {
            setTabActive(true)
          } else {
            console.warn('[audio-capture] Native system audio failed:', result?.error)
          }
        }

        // Start browser mic capture (works with all devices including AirPods)
        let micStream: MediaStream | null = null
        if (options.mic) {
          micStream = await setupMicCapture()
        }

        setCaptureMode('hybrid')
        setIsCapturing(true)
        return { micStream, tabStream: null, mode: 'hybrid' as CaptureMode }
      }

      // ── Browser fallback: full browser-based capture ──
      console.log('[audio-capture] Using browser-based capture (native unavailable)')
      setCaptureMode('browser')

      let micStream: MediaStream | null = null
      let tabStream: MediaStream | null = null

      if (options.mic) {
        micStream = await setupMicCapture()
      }
      if (options.tab) {
        tabStream = await setupTabCapture()
      }

      if (!micStream && !tabStream) {
        setError('No audio source available')
        setCaptureMode('idle')
        return { micStream: null, tabStream: null, mode: 'idle' as CaptureMode }
      }

      setIsCapturing(true)
      return { micStream, tabStream, mode: 'browser' as CaptureMode }
    },
    [setupMicCapture, setupTabCapture],
  )

  // ── Public: stop capture ─────────────────────────────
  const stopCapture = useCallback(async () => {
    if (captureMode === 'hybrid' || captureMode === 'browser') {
      // Stop native system audio capture if it was running
      await window.electronAPI?.stopNativeCapture?.()
    }
    // Extension mode: audio/video stops when the extension user clicks "Stop"
    // in Chrome — no action needed from Electron side

    // Clean up browser resources (video stream in native mode, everything in browser mode)
    micProcessorRef.current?.disconnect()
    tabProcessorRef.current?.disconnect()
    micProcessorRef.current = null
    tabProcessorRef.current = null

    micContextRef.current?.close()
    tabContextRef.current?.close()
    micContextRef.current = null
    tabContextRef.current = null

    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    tabStreamRef.current?.getTracks().forEach((t) => t.stop())
    micCloneRef.current?.getTracks().forEach((t) => t.stop())
    tabCloneRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    tabStreamRef.current = null
    micCloneRef.current = null
    tabCloneRef.current = null

    setIsCapturing(false)
    setMicActive(false)
    setTabActive(false)
    setError(null)
    setCaptureMode('idle')
  }, [captureMode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      micProcessorRef.current?.disconnect()
      tabProcessorRef.current?.disconnect()
      micContextRef.current?.close()
      tabContextRef.current?.close()
      micStreamRef.current?.getTracks().forEach((t) => t.stop())
      tabStreamRef.current?.getTracks().forEach((t) => t.stop())
      micCloneRef.current?.getTracks().forEach((t) => t.stop())
      tabCloneRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return {
    isCapturing,
    micActive,
    tabActive,
    error,
    captureMode,
    nativeAvailable: nativeStatus.available && nativeStatus.connected,
    nativeStatus,
    extensionConnected,
    startCapture,
    stopCapture,
    getMicStream: () => micStreamRef.current,
    getTabStream: () => tabStreamRef.current,
  }
}
