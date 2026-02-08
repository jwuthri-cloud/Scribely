"use strict";
const electron = require("electron");
const path = require("path");
const Store = require("electron-store");
let NSWindow = null;
try {
  NSWindow = require("nswindow-napi");
} catch {
  console.warn("[invisibility] nswindow-napi not available — screen-sharing invisibility disabled");
}
function applyInvisibility(win) {
  if (!NSWindow) return;
  const handle = win.getNativeWindowHandle();
  const canJoinAllSpaces = NSWindow.GetNSWindowCollectionBehaviorCanJoinAllSpaces?.() ?? 0;
  const stationary = NSWindow.GetNSWindowCollectionBehaviorStationary?.() ?? 0;
  const ignoresCycle = NSWindow.GetNSWindowCollectionBehaviorIgnoresCycle?.() ?? 0;
  const behavior = canJoinAllSpaces | stationary | ignoresCycle;
  if (behavior) {
    NSWindow.SetCollectionBehavior(handle, behavior);
  }
  const level = NSWindow.GetKCGAssistiveTechHighWindowLevel?.();
  if (level !== void 0) {
    NSWindow.SetLevel(handle, level);
  }
  win.setContentProtection(true);
  console.log("[invisibility] macOS window invisibility applied");
}
const HOTKEY = "CommandOrControl+Shift+Space";
function registerGlobalHotkey(win) {
  const registered = electron.globalShortcut.register(HOTKEY, () => {
    if (win.isVisible()) {
      win.webContents.send("toggle-visibility", false);
      setTimeout(() => win.hide(), 200);
    } else {
      win.show();
      win.webContents.send("toggle-visibility", true);
    }
  });
  if (!registered) {
    console.error(`[hotkey] Failed to register global shortcut: ${HOTKEY}`);
  } else {
    console.log(`[hotkey] Registered global shortcut: ${HOTKEY}`);
  }
}
function unregisterAllHotkeys() {
  electron.globalShortcut.unregisterAll();
}
const store = new Store({
  defaults: {
    themeId: "atom-dark"
  }
});
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 420,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  applyInvisibility(mainWindow);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  registerGlobalHotkey(mainWindow);
}
function registerIpcHandlers() {
  electron.ipcMain.handle("get-theme-id", () => {
    return store.get("themeId", "atom-dark");
  });
  electron.ipcMain.on("set-theme-id", (_event, themeId) => {
    store.set("themeId", themeId);
  });
  electron.ipcMain.on("send-message", (_event, message) => {
    console.log("[ipc] Received message:", message);
    if (mainWindow) {
      setTimeout(() => {
        mainWindow.webContents.send(
          "chat-response",
          `You said: "${message}"

(Placeholder — backend integration coming soon.)`
        );
      }, 600);
    }
  });
  electron.ipcMain.on("app-quit", () => {
    electron.app.quit();
  });
}
electron.app.whenReady().then(() => {
  if (process.platform === "darwin") {
    electron.app.dock.hide();
  }
  registerIpcHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("will-quit", () => {
  unregisterAllHotkeys();
});
