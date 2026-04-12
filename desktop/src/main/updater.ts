import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { createLogger } from './logger'

const log = createLogger('updater')

let pendingVersion: string | null = null
let ipcRegistered = false

function sendToRenderer(getWindow: () => BrowserWindow | null, channel: string, payload?: unknown) {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

export function registerUpdaterIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle('updater:get-status', () => ({
    currentVersion: app.getVersion(),
    pendingVersion,
    updatesEnabled: app.isPackaged && process.env.SCRIBELY_DISABLE_AUTO_UPDATE !== '1',
  }))

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { ok: false as const, error: 'Updates are only available in the installed app.' }
    }
    if (process.env.SCRIBELY_DISABLE_AUTO_UPDATE === '1') {
      return { ok: false as const, error: 'Automatic updates are disabled.' }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.warn({ err: e }, 'Manual update check failed')
      return { ok: false as const, error: msg }
    }
  })

  ipcMain.handle('updater:quit-and-install', () => {
    if (pendingVersion) {
      autoUpdater.quitAndInstall(false, true)
    }
  })
}

/** Tray / menu: trigger the same check as Settings. */
export async function checkForUpdatesNow(): Promise<void> {
  if (!app.isPackaged || process.env.SCRIBELY_DISABLE_AUTO_UPDATE === '1') return
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    log.warn({ err: e }, 'checkForUpdatesNow failed')
  }
}

export function startAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    log.info('Auto-updater inactive (development build)')
    return
  }
  if (process.env.SCRIBELY_DISABLE_AUTO_UPDATE === '1') {
    log.info('Auto-updater disabled (SCRIBELY_DISABLE_AUTO_UPDATE=1)')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update…')
    sendToRenderer(getWindow, 'updater:checking')
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: ${info.version}`)
    sendToRenderer(getWindow, 'updater:update-available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('No update available')
    sendToRenderer(getWindow, 'updater:update-not-available')
  })

  autoUpdater.on('error', (err) => {
    log.warn({ err }, 'Updater error')
    const message = err.message || String(err)
    sendToRenderer(getWindow, 'updater:error', { message })
  })

  autoUpdater.on('download-progress', (p) => {
    sendToRenderer(getWindow, 'updater:download-progress', {
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    pendingVersion = info.version
    log.info(`Update downloaded: ${info.version}`)
    sendToRenderer(getWindow, 'updater:update-downloaded', { version: info.version })

    const win = getWindow()
    const opts = {
      type: 'info' as const,
      title: 'Update ready',
      message: `Scribely ${info.version} is ready to install.`,
      detail: 'Restart now to finish updating.',
      buttons: ['Restart', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }

    if (win && !win.isDestroyed()) {
      dialog
        .showMessageBox(win, opts)
        .then(({ response }) => {
          if (response === 0) {
            autoUpdater.quitAndInstall(false, true)
          }
        })
        .catch(() => {})
    } else {
      dialog.showMessageBox(opts).catch(() => {})
    }
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => log.warn({ err: e }, 'Startup update check failed'))
  }, 15_000)
}
