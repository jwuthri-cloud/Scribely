import { desktopCapturer, BrowserWindow } from 'electron'

/**
 * Captures the primary screen as a base64 PNG data URL.
 * Hides the overlay window first so it doesn't appear in the capture.
 */
export async function captureScreen(win: BrowserWindow): Promise<string> {
  const wasVisible = win.isVisible()
  if (wasVisible) win.hide()

  // Wait for the window to fully disappear from screen
  await new Promise((r) => setTimeout(r, 150))

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  })

  if (wasVisible) {
    win.show()
  }

  const primary = sources[0]
  if (!primary) throw new Error('No screen source found')

  return primary.thumbnail.toDataURL()
}
