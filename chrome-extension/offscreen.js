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

// ── WebSocket connection ──────────────────────────────
function connectWebSocket(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`)
    socket.binaryType = 'arraybuffer'

    socket.onopen = () => {
      console.log('[offscreen] WebSocket connected')
      // Send hello control message
      sendControl(socket, { type: 'hello', source: 'chrome-extension' })
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

    // 3. Play the tab audio back to the user's speakers so they still hear it.
    //    We clone the audio tracks so the playback is independent of the capture graph.
    const audioTracks = mediaStream.getAudioTracks()
    if (audioTracks.length > 0) {
      const playbackStream = new MediaStream(audioTracks.map(t => t.clone()))
      const audioEl = document.getElementById('tabAudioPlayback')
      audioEl.srcObject = playbackStream
      audioEl.play().catch(() => {})
    }

    // 4. Set up AudioWorklet for PCM extraction at 16kHz
    if (audioTracks.length > 0) {
      await setupAudioCapture(mediaStream)
    }

    // 4. Set up MediaRecorder for video chunks
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

// ── Audio capture via AudioWorklet ────────────────────
async function setupAudioCapture(stream) {
  const audioOnly = new MediaStream(stream.getAudioTracks())

  // Try to create context at 16kHz directly; fall back to native rate + resampling
  try {
    audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  } catch {
    audioContext = new AudioContext()
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  await audioContext.audioWorklet.addModule('pcm-worklet.js')

  const source = audioContext.createMediaStreamSource(audioOnly)
  workletNode = new AudioWorkletNode(audioContext, 'pcm-extractor')

  workletNode.port.onmessage = (e) => {
    if (e.data.pcm) {
      sendAudioFrame(ws, e.data.pcm)
    }
  }

  source.connect(workletNode)
  // Connect to destination to keep the graph alive (output is silent)
  const silencer = audioContext.createGain()
  silencer.gain.value = 0
  workletNode.connect(silencer)
  silencer.connect(audioContext.destination)

  console.log(`[offscreen] Audio capture ready (rate=${audioContext.sampleRate})`)
}

// ── Video capture via MediaRecorder ───────────────────
function setupVideoCapture(stream) {
  const videoOnly = new MediaStream(stream.getVideoTracks())

  // Pick the best available codec
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm;codecs=vp8'

  mediaRecorder = new MediaRecorder(videoOnly, {
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

  // Stop audio playback
  const audioEl = document.getElementById('tabAudioPlayback')
  if (audioEl) {
    audioEl.pause()
    audioEl.srcObject = null
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
