/**
 * Background service worker for Scribely Tab Capture extension.
 *
 * Handles:
 * - Tab capture stream ID via chrome.tabCapture.getMediaStreamId()
 * - Creating/managing the offscreen document for media processing
 * - Message relay between popup and offscreen document
 * - Meeting tab detection and badge
 */

import { isMeetingUrl } from './meeting-detector.js'

const OFFSCREEN_URL = 'offscreen.html'
const WS_PORT = 9876

// ── State ──────────────────────────────────────────────
let isCapturing = false
let capturedTabId = null
let meetingTabId = null
let meetingTabInfo = null

// ── Meeting detection ──────────────────────────────────
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
  } else {
    await chrome.action.setBadgeText({ text: '' })
  }
}

function onTabUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status === 'loading' && !changeInfo.url) return
  const url = changeInfo.url ?? tab?.url
  if (url && isMeetingUrl(url)) {
    updateMeetingState()
  } else if (meetingTabId === tabId) {
    updateMeetingState()
  }
}

function onTabActivated() {
  updateMeetingState()
}

chrome.tabs.onUpdated.addListener(onTabUpdated)
chrome.tabs.onActivated.addListener(onTabActivated)
chrome.tabs.onRemoved.addListener((tabId) => {
  if (meetingTabId === tabId) updateMeetingState()
})
updateMeetingState()

// ── Offscreen document management ─────────────────────
async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  })

  if (contexts.length > 0) return // already exists

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

  if (contexts.length > 0) {
    await chrome.offscreen.closeDocument()
  }
}

// ── Start tab capture ─────────────────────────────────
async function startCapture(tabId) {
  if (isCapturing) {
    console.log('[bg] Already capturing — stop first')
    return { success: false, error: 'Already capturing' }
  }

  try {
    // Get a media stream ID for the target tab
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })

    // Ensure offscreen document is running
    await ensureOffscreenDocument()

    // Tell offscreen document to start capture with the stream ID
    chrome.runtime.sendMessage({
      type: 'start-capture',
      streamId,
      tabId,
      wsPort: WS_PORT,
    })

    isCapturing = true
    capturedTabId = tabId
    return { success: true }
  } catch (err) {
    console.error('[bg] Tab capture failed:', err)
    return { success: false, error: err.message }
  }
}

// ── Stop tab capture ──────────────────────────────────
async function stopCapture() {
  if (!isCapturing) return { success: true }

  try {
    chrome.runtime.sendMessage({ type: 'stop-capture' })
    // Give the offscreen doc time to clean up, then close it
    setTimeout(async () => {
      await closeOffscreenDocument()
    }, 500)

    isCapturing = false
    capturedTabId = null
    return { success: true }
  } catch (err) {
    console.error('[bg] Stop capture failed:', err)
    return { success: false, error: err.message }
  }
}

// ── Message handler ───────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'get-status': {
      sendResponse({
        isCapturing,
        capturedTabId,
        meetingTabId,
        meetingTabInfo,
      })
      return false
    }

    case 'start-capture-request': {
      // From popup: start capturing the specified tab
      startCapture(message.tabId).then(sendResponse)
      return true // async response
    }

    case 'stop-capture-request':
      stopCapture().then(sendResponse)
      return true

    case 'capture-started':
      // Confirmation from offscreen document
      isCapturing = true
      console.log('[bg] Capture confirmed by offscreen doc')
      return false

    case 'capture-stopped':
      isCapturing = false
      capturedTabId = null
      console.log('[bg] Capture stopped by offscreen doc')
      // Close the offscreen document so Chrome clears the tab capture
      // indicator.  This is essential for Electron-initiated stops where
      // the background's own stopCapture() is never called.
      closeOffscreenDocument().catch(() => {})
      return false

    case 'capture-error':
      console.error('[bg] Capture error:', message.error)
      isCapturing = false
      capturedTabId = null
      return false

    case 'mic-permission-granted':
      console.log('[bg] Mic permission granted via permissions page')
      return false

    default:
      return false
  }
})
