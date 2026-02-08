import { BrowserWindow } from 'electron'

let NSWindow: typeof import('nswindow-napi') | null = null

try {
  NSWindow = require('nswindow-napi')
} catch {
  console.warn('[invisibility] nswindow-napi not available — screen-sharing invisibility disabled')
}

/**
 * Applies macOS-specific window manipulation to make the overlay invisible
 * to most screen-sharing / screen-capture tools.
 *
 * Two-layer approach:
 *  1. `sharingType = .none` — prevents legacy CGWindowListCreateImage capture
 *  2. `AssistiveTechHighWindowLevel` — hides the black rectangle left by step 1
 *
 * Also sets collection behaviors so the window appears on all Spaces and
 * stays out of the Cmd-Tab / Mission Control cycle.
 */
export function applyInvisibility(win: BrowserWindow): void {
  if (!NSWindow) return

  const handle = win.getNativeWindowHandle()

  // --- Collection behaviors ---
  // canJoinAllSpaces | stationary | ignoresCycle
  const canJoinAllSpaces = NSWindow.GetNSWindowCollectionBehaviorCanJoinAllSpaces?.() ?? 0
  const stationary = NSWindow.GetNSWindowCollectionBehaviorStationary?.() ?? 0
  const ignoresCycle = NSWindow.GetNSWindowCollectionBehaviorIgnoresCycle?.() ?? 0

  const behavior = canJoinAllSpaces | stationary | ignoresCycle
  if (behavior) {
    NSWindow.SetCollectionBehavior(handle, behavior)
  }

  // --- Assistive-tech high window level ---
  const level = NSWindow.GetKCGAssistiveTechHighWindowLevel?.()
  if (level !== undefined) {
    NSWindow.SetLevel(handle, level)
  }

  // --- Content protection (sharingType = .none) ---
  win.setContentProtection(true)

  console.log('[invisibility] macOS window invisibility applied')
}
