import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { applyInvisibility } from './invisibility'
import { registerGlobalHotkey, unregisterAllHotkeys } from './hotkey'

const store = new Store({
  defaults: {
    themeId: 'atom-dark',
  },
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Apply macOS screen-sharing invisibility
  applyInvisibility(mainWindow)

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Register toggle hotkey
  registerGlobalHotkey(mainWindow)
}

function registerIpcHandlers(): void {
  // Theme persistence via electron-store
  ipcMain.handle('get-theme-id', () => {
    return store.get('themeId', 'atom-dark')
  })

  ipcMain.on('set-theme-id', (_event, themeId: string) => {
    store.set('themeId', themeId)
  })

  // Handle send-message IPC from renderer (placeholder — will route to backend)
  ipcMain.on('send-message', (_event, message: string) => {
    console.log('[ipc] Received message:', message)
    // Placeholder echo response — will be replaced with backend call
    if (mainWindow) {
      setTimeout(() => {
        mainWindow!.webContents.send(
          'chat-response',
          `You said: "${message}"\n\n(Placeholder — backend integration coming soon.)`,
        )
      }, 600)
    }
  })

  // Handle app-quit IPC from renderer
  ipcMain.on('app-quit', () => {
    app.quit()
  })
}

// Hide the dock icon on macOS so the overlay is truly minimal
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  unregisterAllHotkeys()
})
