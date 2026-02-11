/**
 * Offscreen document for AssistMe Tab Capture.
 *
 * This document runs in a hidden context and has access to:
 * - navigator.mediaDevices.getUserMedia (with tab capture stream ID)
 * - AudioWorklet (for PCM extraction)
 * - MediaRecorder (for WebM video)
 * - WebSocket (to stream data to the Electron app)
 *
 * Binary protocol to Electron WS server:
 *   0x01 + Float32Array → audio PCM frame (16kHz)
 *   0x02 + Uint8Array   → video WebM chunk
 *   0x03 + JSON string   → control message
 */

const MSG_AUDIO = 0x01
const MSG_VIDEO = 0x02
const MSG_CONTROL = 0x03

const TARGET_SAMPLE_RATE = 16000

let mediaStream = null
let audioContext = null
let workletNode = null
let mediaRecorder = null
let ws = null
let isStopping = false
let playbackTracks = null // cloned tracks used for AudioContext playback

// ── WebSocket connection ──────────────────────────────
function connectWebSocket(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`)
    socket.binaryType = 'arraybuffer'

    socket.onopen = () => {
      console.log('[offscreen] WebSocket connected')
      // Hello is sent from startCapture() after AudioContext is created,
      // so we can include the actual sampleRate.
      resolve(socket)
    }

    socket.onerror = (err) => {
      console.error('[offscreen] WebSocket error:', err)
      reject(new Error('WebSocket connection failed — is AssistMe running?'))
    }

    socket.onmessage = (event) => {
      // Handle control messages from Electron (e.g. stop-capture)
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength < 2) return
      const view = new Uint8Array(event.data)
      if (view[0] === MSG_CONTROL) {
        try {
          const json = new TextDecoder().decode(view.slice(1))
          const msg = JSON.parse(json)
          if (msg.type === 'stop-capture') {
            console.log('[offscreen] Received stop-capture from Electron')
            stopCapture()
          }
        } catch { /* ignore parse errors */ }
      }
    }

    socket.onclose = () => {
      console.log('[offscreen] WebSocket closed')
      // If Electron quits or the WS drops, stop capturing
      if (mediaStream) {
        console.log('[offscreen] WS lost — stopping capture')
        stopCapture()
      }
    }

    // Timeout after 5 seconds
    setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        socket.close()
        reject(new Error('WebSocket connection timed out'))
      }
    }, 5000)
  })
}

function sendControl(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const json = JSON.stringify(payload)
  const header = new Uint8Array([MSG_CONTROL])
  const body = new TextEncoder().encode(json)
  const msg = new Uint8Array(header.length + body.length)
  msg.set(header)
  msg.set(body, 1)
  socket.send(msg.buffer)
}

function sendAudioFrame(socket, pcmBuffer) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const header = new Uint8Array([MSG_AUDIO])
  const pcmBytes = new Uint8Array(pcmBuffer)
  const msg = new Uint8Array(header.length + pcmBytes.length)
  msg.set(header)
  msg.set(pcmBytes, 1)
  socket.send(msg.buffer)
}

function sendVideoChunk(socket, data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const header = new Uint8Array([MSG_VIDEO])
  const bytes = new Uint8Array(data)
  const msg = new Uint8Array(header.length + bytes.length)
  msg.set(header)
  msg.set(bytes, 1)
  socket.send(msg.buffer)
}

// ── Start capture ─────────────────────────────────────
async function startCapture(streamId, wsPort) {
  isStopping = false // reset guard for new session
  try {
    // 1. Get the media stream from the tab capture stream ID
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      },
    })

    console.log(
      `[offscreen] Got media stream: ${mediaStream.getAudioTracks().length} audio, ` +
      `${mediaStream.getVideoTracks().length} video tracks`
    )

    // 2. Connect to Electron's WebSocket server
    ws = await connectWebSocket(wsPort)

    // 3. Set up AudioWorklet for PCM extraction + low-latency playback
    //    (playback goes through the AudioContext, NOT an <audio> element —
    //    Chrome's <audio> in offscreen docs buffers aggressively, adding
    //    seconds of delay.)
    const audioTracks = mediaStream.getAudioTracks()
    let actualSampleRate = TARGET_SAMPLE_RATE
    if (audioTracks.length > 0) {
      await setupAudioCapture(mediaStream)
      if (audioContext) {
        actualSampleRate = audioContext.sampleRate
      }
    }

    // 5. Send hello with the real sample rate so Electron knows how to resample
    sendControl(ws, {
      type: 'hello',
      source: 'chrome-extension',
      sampleRate: actualSampleRate,
    })

    // 6. Set up MediaRecorder for video chunks
    const videoTracks = mediaStream.getVideoTracks()
    if (videoTracks.length > 0) {
      setupVideoCapture(mediaStream)
    }

    // Notify background that capture started
    chrome.runtime.sendMessage({ type: 'capture-started' })

    // Listen for stream ending (user revokes tab sharing)
    mediaStream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        console.log(`[offscreen] Track ended: ${track.kind}`)
        stopCapture()
      })
    })
  } catch (err) {
    console.error('[offscreen] Start capture failed:', err)
    chrome.runtime.sendMessage({ type: 'capture-error', error: err.message })
    stopCapture()
  }
}

// ── Audio capture via AudioWorklet + low-latency playback ──
async function setupAudioCapture(stream) {
  const audioOnly = new MediaStream(stream.getAudioTracks())

  // Always use native sample rate (typically 48kHz).  Forcing 16kHz makes
  // Chrome resample inside the capture chain which adds latency.
  // Electron's AudioPipeline handles the 48kHz → 16kHz resample instead.
  // 'interactive' latencyHint asks for the smallest buffer size.
  audioContext = new AudioContext({ latencyHint: 'interactive' })

  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  await audioContext.audioWorklet.addModule('pcm-worklet.js')

  // ── PCM extraction chain (silent) ──
  const source = audioContext.createMediaStreamSource(audioOnly)
  workletNode = new AudioWorkletNode(audioContext, 'pcm-extractor')

  workletNode.port.onmessage = (e) => {
    if (e.data.pcm) {
      sendAudioFrame(ws, e.data.pcm)
    }
  }

  source.connect(workletNode)
  const silencer = audioContext.createGain()
  silencer.gain.value = 0
  workletNode.connect(silencer)
  silencer.connect(audioContext.destination)

  // ── Playback chain (audible) ──
  // Route cloned audio tracks through the AudioContext's destination so the
  // user still hears the tab audio.  This is much lower latency than an
  // <audio> element (which Chrome buffers aggressively in offscreen docs).
  playbackTracks = stream.getAudioTracks().map(t => t.clone())
  const playbackStream = new MediaStream(playbackTracks)
  const playbackSource = audioContext.createMediaStreamSource(playbackStream)
  playbackSource.connect(audioContext.destination)

  console.log(`[offscreen] Audio capture + playback ready (rate=${audioContext.sampleRate})`)
}

// ── Video capture via MediaRecorder ───────────────────
function setupVideoCapture(stream) {
  // Use the full stream (audio + video) so the saved .webm includes sound.
  // Audio also goes through the AudioWorklet for real-time transcription —
  // both consumers can read from the same tracks simultaneously.
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm;codecs=vp8'

  mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000, // 2.5 Mbps
  })

  mediaRecorder.ondataavailable = async (e) => {
    if (e.data.size > 0) {
      const buffer = await e.data.arrayBuffer()
      sendVideoChunk(ws, buffer)
    }
  }

  mediaRecorder.onstop = () => {
    console.log('[offscreen] MediaRecorder stopped')
  }

  // Request data every 1 second
  mediaRecorder.start(1000)
  console.log(`[offscreen] Video recording started (${mimeType})`)
}

// ── Stop capture ──────────────────────────────────────
function stopCapture() {
  if (isStopping) return
  isStopping = true

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  mediaRecorder = null

  if (workletNode) {
    workletNode.disconnect()
    workletNode = null
  }

  if (audioContext) {
    audioContext.close().catch(() => {})
    audioContext = null
  }

  // Stop cloned playback tracks
  if (playbackTracks) {
    playbackTracks.forEach(t => t.stop())
    playbackTracks = null
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    sendControl(ws, { type: 'capture-stopped' })
    ws.close()
  }
  ws = null

  chrome.runtime.sendMessage({ type: 'capture-stopped' })
  console.log('[offscreen] Capture stopped — all resources cleaned up')
  // NOTE: isStopping stays true to block late async callbacks (e.g.
  // track "ended" events fired after track.stop()).  It is reset at the
  // top of startCapture() when a new session begins.
}

// ── Listen for messages from background ───────────────
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'start-capture':
      startCapture(message.streamId, message.wsPort)
      break
    case 'stop-capture':
      stopCapture()
      break
  }
})
