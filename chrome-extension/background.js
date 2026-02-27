/**
 * Background service worker for Scribely Tab Capture.
 *
 * - Popup: tabCapture (user clicked icon → Record works)
 * - Widget on meeting page: getDisplayMedia (shows tab picker, then records)
 */

import { isMeetingUrl } from './meeting-detector.js'

const OFFSCREEN_URL = 'offscreen.html'
const WS_PORT = 9876

let isCapturing = false
let capturedTabId = null
let meetingTabId = null
let meetingTabInfo = null
let desktopConnected = false
let autoStartCapture = false

async function checkDesktopConnection() {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`)
      const t = setTimeout(() => {
        ws.close()
        resolve(false)
      }, 2000)
      ws.onopen = () => {
        clearTimeout(t)
        ws.close()
        resolve(true)
      }
      ws.onerror = () => {
        clearTimeout(t)
        resolve(false)
      }
    } catch {
      resolve(false)
    }
  })
}

function broadcastState() {
  const payload = {
    type: 'scribely:state-update',
    connected: desktopConnected,
    isCapturing,
    capturedTabId,
    meetingTabId,
    meetingTabInfo,
  }
  chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id && tab.url && isMeetingUrl(tab.url)) {
        chrome.tabs.sendMessage(tab.id, payload).catch(() => {})
      }
    }
  })
}

async function updateMeetingState() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const allTabs = await chrome.tabs.query({})
  const meetingTabs = allTabs.filter((t) => t.url && isMeetingUrl(t.url))
  const activeIsMeeting = activeTab && meetingTabs.some((t) => t.id === activeTab.id)
  const found = activeIsMeeting
    ? { tabId: activeTab.id, title: activeTab.title || activeTab.url, url: activeTab.url }
    : meetingTabs[0]
      ? { tabId: meetingTabs[0].id, title: meetingTabs[0].title || meetingTabs[0].url, url: meetingTabs[0].url }
      : null

  meetingTabId = found?.tabId ?? null
  meetingTabInfo = found ?? null

  if (meetingTabId) {
    await chrome.action.setBadgeText({ text: 'Rec' })
    await chrome.action.setBadgeBackgroundColor({ color: '#4caf50' })
    desktopConnected = await checkDesktopConnection()
  } else {
    await chrome.action.setBadgeText({ text: '' })
  }
  broadcastState()
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url ?? tab?.url
  if ((url && isMeetingUrl(url)) || meetingTabId === tabId || changeInfo.status === 'complete') {
    updateMeetingState()
  }
})
chrome.tabs.onActivated.addListener(() => updateMeetingState())
chrome.tabs.onRemoved.addListener((tabId) => {
  if (meetingTabId === tabId) updateMeetingState()
})
updateMeetingState()

setInterval(() => {
  if (meetingTabId) {
    checkDesktopConnection().then((conn) => {
      if (conn !== desktopConnected) {
        desktopConnected = conn
        broadcastState()
      }
    })
  }
}, 5000)

// ── Offscreen document ─────────────────────────────────
async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  })
  if (contexts.length > 0) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Tab audio/video capture for Scribely transcription',
  })
}

async function closeOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  })
  if (contexts.length > 0) await chrome.offscreen.closeDocument()
}

// ── Popup path: tabCapture (icon was clicked) ─
async function startCapture(tabId) {
  if (isCapturing) return { success: false, error: 'Already capturing' }
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })
    await ensureOffscreenDocument()
    chrome.runtime.sendMessage({ type: 'start-capture', streamId, tabId, wsPort: WS_PORT })
    isCapturing = true
    capturedTabId = tabId
    broadcastState()
    return { success: true }
  } catch (err) {
    console.error('[bg] Tab capture failed:', err)
    return { success: false, error: err.message }
  }
}

async function stopCapture() {
  if (!isCapturing) return { success: true }
  try {
    chrome.runtime.sendMessage({ type: 'stop-capture' })
    setTimeout(() => closeOffscreenDocument(), 500)
    isCapturing = false
    capturedTabId = null
    broadcastState()
    return { success: true }
  } catch (err) {
    console.error('[bg] Stop failed:', err)
    return { success: false, error: err.message }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'get-status':
      sendResponse({
        isCapturing,
        capturedTabId,
        meetingTabId,
        meetingTabInfo,
        autoStartCapture,
      })
      return false

    case 'start-capture-request':
      autoStartCapture = false
      startCapture(message.tabId).then(sendResponse)
      return true

    case 'stop-capture-request':
      stopCapture().then(sendResponse)
      return true

    case 'content:get-status':
      checkDesktopConnection().then((conn) => {
        desktopConnected = conn
        sendResponse({
          connected: desktopConnected,
          isCapturing,
          capturedTabId,
          meetingTabId,
          meetingTabInfo,
        })
      })
      return true

    case 'content:request-capture': {
      // Set flag so when user clicks extension icon, popup auto-starts capture.
      // activeTab is only granted when user clicks the icon — no workaround.
      autoStartCapture = true
      sendResponse({ success: true })
      return false
    }

    case 'content:launch-app':
      chrome.tabs.create({ url: 'scribely://launch', active: false })
      sendResponse({ success: true })
      return false

    case 'capture-started':
      isCapturing = true
      capturedTabId = message.tabId ?? capturedTabId
      broadcastState()
      return false

    case 'capture-stopped':
      isCapturing = false
      capturedTabId = null
      closeOffscreenDocument().catch(() => {})
      broadcastState()
      return false

    case 'capture-error':
      isCapturing = false
      capturedTabId = null
      broadcastState()
      return false

    case 'mic-permission-granted':
      return false

    default:
      return false
  }
})
