/**
 * Popup UI for Scribely Tab Capture extension.
 *
 * Shows current tab info, connection status to the Electron app,
 * meeting detection, and a Start/Stop capture button.
 * When desktop app is not running, offers "Launch Scribely" via scribely://.
 */

const WS_PORT = 9876

const statusDot = document.getElementById('statusDot')
const wsStatus = document.getElementById('wsStatus')
const tabIcon = document.getElementById('tabIcon')
const tabName = document.getElementById('tabName')
const errorBox = document.getElementById('errorBox')
const captureBtn = document.getElementById('captureBtn')
const captureBtnText = document.getElementById('captureBtnText')
const micBar = document.getElementById('micBar')
const micStatus = document.getElementById('micStatus')
const micGrantLink = document.getElementById('micGrantLink')
const launchBar = document.getElementById('launchBar')
const launchBtn = document.getElementById('launchBtn')
const meetingBanner = document.getElementById('meetingBanner')

let currentTabId = null
let isCapturing = false
let hasMeetingTab = false

// ── Initialize ────────────────────────────────────────
async function init() {
  const status = await sendMessage({ type: 'get-status' })
  const meetingTabId = status?.meetingTabId
  const meetingTabInfo = status?.meetingTabInfo

  hasMeetingTab = !!meetingTabId

  // Prefer meeting tab for capture; otherwise use active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (meetingTabId) {
    currentTabId = meetingTabId
    tabName.textContent = meetingTabInfo?.title || 'Meeting'
    const meetingTab = await chrome.tabs.get(meetingTabId).catch(() => null)
    if (meetingTab?.favIconUrl) {
      tabIcon.src = meetingTab.favIconUrl
      tabIcon.style.display = 'block'
    } else {
      tabIcon.style.display = 'none'
    }
  } else if (activeTab) {
    currentTabId = activeTab.id
    tabName.textContent = activeTab.title || activeTab.url || 'Unknown tab'
    if (activeTab.favIconUrl) {
      tabIcon.src = activeTab.favIconUrl
      tabIcon.style.display = 'block'
    } else {
      tabIcon.style.display = 'none'
    }
  }

  if (status?.isCapturing) {
    setCapturingState(true)
  }

  const connected = await checkDesktopConnection()
  setLaunchBarVisibility(!connected)

  await checkMicPermission()

  captureBtn.disabled = !connected
  updateCaptureButtonLabel()
  meetingBanner.style.display = hasMeetingTab ? 'flex' : 'none'
}

// ── Launch Scribely (scribely://) ───────────────────────
launchBtn.addEventListener('click', async () => {
  clearError()
  launchBtn.disabled = true
  try {
    chrome.tabs.create({ url: 'scribely://launch' })
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const connected = await checkDesktopConnection()
      if (connected) {
        setLaunchBarVisibility(false)
        captureBtn.disabled = false
        break
      }
    }
  } finally {
    launchBtn.disabled = false
  }
})

function setLaunchBarVisibility(show) {
  launchBar.style.display = show ? 'flex' : 'none'
}

function updateCaptureButtonLabel() {
  captureBtnText.textContent = hasMeetingTab ? 'Record Meeting' : 'Start Sharing'
}

// ── Check microphone permission status ────────────────
async function checkMicPermission() {
  micBar.style.display = 'flex'
  try {
    const result = await navigator.permissions.query({ name: 'microphone' })
    updateMicStatus(result.state)
    result.addEventListener('change', () => updateMicStatus(result.state))
  } catch {
    micStatus.textContent = 'Unknown'
    micStatus.className = 'value'
    micGrantLink.style.display = 'inline'
  }
}

function updateMicStatus(state) {
  if (state === 'granted') {
    micStatus.textContent = 'Enabled'
    micStatus.className = 'value ok'
    micGrantLink.style.display = 'none'
  } else {
    micStatus.textContent = state === 'denied' ? 'Denied' : 'Not granted'
    micStatus.className = 'value err'
    micGrantLink.style.display = 'inline'
  }
}

micGrantLink.addEventListener('click', (e) => {
  e.preventDefault()
  chrome.tabs.create({ url: 'permissions.html' })
})

// ── Check if Electron WS server is reachable ──────────
async function checkDesktopConnection() {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}`)
    const timeout = setTimeout(() => {
      socket.close()
      setConnectionStatus(false)
      resolve(false)
    }, 2000)

    socket.onopen = () => {
      clearTimeout(timeout)
      socket.close()
      setConnectionStatus(true)
      resolve(true)
    }

    socket.onerror = () => {
      clearTimeout(timeout)
      setConnectionStatus(false)
      resolve(false)
    }
  })
}

function setConnectionStatus(connected) {
  if (connected) {
    wsStatus.textContent = 'Connected'
    wsStatus.className = 'value ok'
  } else {
    wsStatus.textContent = 'Not running'
    wsStatus.className = 'value err'
  }
  setLaunchBarVisibility(!connected)
}

function setCapturingState(capturing) {
  isCapturing = capturing
  if (capturing) {
    statusDot.className = 'dot capturing'
    captureBtn.className = 'btn btn-stop'
    captureBtnText.textContent = 'Stop Sharing'
    captureBtn.querySelector('svg').innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"/>'
  } else {
    statusDot.className = 'dot connected'
    captureBtn.className = 'btn btn-start'
    captureBtnText.textContent = hasMeetingTab ? 'Record Meeting' : 'Start Sharing'
    captureBtn.querySelector('svg').innerHTML = '<circle cx="12" cy="12" r="8"/>'
  }
}

function showError(msg) {
  errorBox.textContent = msg
  errorBox.style.display = 'block'
}

function clearError() {
  errorBox.style.display = 'none'
}

// ── Capture button handler ────────────────────────────
captureBtn.addEventListener('click', async () => {
  clearError()
  captureBtn.disabled = true

  try {
    if (isCapturing) {
      const result = await sendMessage({ type: 'stop-capture-request' })
      if (result?.success) {
        setCapturingState(false)
      } else {
        showError(result?.error || 'Failed to stop capture')
      }
    } else {
      if (!currentTabId) {
        showError('No active tab found')
        return
      }

      // Verify desktop app is reachable first
      const connected = await checkDesktopConnection()
      if (!connected) {
        showError('Scribely desktop app is not running. Start it first.')
        return
      }

      const result = await sendMessage({
        type: 'start-capture-request',
        tabId: currentTabId,
      })

      if (result?.success) {
        setCapturingState(true)
      } else {
        showError(result?.error || 'Failed to start capture')
      }
    }
  } catch (err) {
    showError(err.message)
  } finally {
    captureBtn.disabled = false
  }
})

// ── Helper: send message to background ────────────────
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve)
  })
}

// ── Init on load ──────────────────────────────────────
init()
