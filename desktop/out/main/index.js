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
async function captureScreen(win) {
  const wasVisible = win.isVisible();
  if (wasVisible) win.hide();
  await new Promise((r) => setTimeout(r, 150));
  const sources = await electron.desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1920, height: 1080 }
  });
  if (wasVisible) {
    win.show();
  }
  const primary = sources[0];
  if (!primary) throw new Error("No screen source found");
  return primary.thumbnail.toDataURL();
}
function registerAllHotkeys(win, store2) {
  const settings = store2.store;
  const { hotkeys, moveStepPx } = settings;
  tryRegister(hotkeys.toggleOverlay, () => {
    if (win.isVisible()) {
      win.webContents.send("toggle-visibility", false);
      setTimeout(() => win.hide(), 200);
    } else {
      win.show();
      win.webContents.send("toggle-visibility", true);
    }
  });
  tryRegister(hotkeys.moveUp, () => {
    const [x, y] = win.getPosition();
    win.setPosition(x, y - moveStepPx);
  });
  tryRegister(hotkeys.moveDown, () => {
    const [x, y] = win.getPosition();
    win.setPosition(x, y + moveStepPx);
  });
  tryRegister(hotkeys.moveLeft, () => {
    const [x, y] = win.getPosition();
    win.setPosition(x - moveStepPx, y);
  });
  tryRegister(hotkeys.moveRight, () => {
    const [x, y] = win.getPosition();
    win.setPosition(x + moveStepPx, y);
  });
  tryRegister(hotkeys.takeScreenshot, async () => {
    try {
      const dataUrl = await captureScreen(win);
      win.webContents.send("screenshot-taken", dataUrl);
    } catch (err) {
      console.error("[hotkey] Screenshot failed:", err);
    }
  });
  tryRegister(hotkeys.toggleAudio, () => {
    win.webContents.send("toggle-audio");
  });
  tryRegister(hotkeys.resetChat, () => {
    win.webContents.send("reset-chat");
  });
}
function unregisterAllHotkeys() {
  electron.globalShortcut.unregisterAll();
}
function reregisterHotkeys(win, store2) {
  unregisterAllHotkeys();
  registerAllHotkeys(win, store2);
}
function tryRegister(accelerator, callback) {
  if (!accelerator) return;
  const ok = electron.globalShortcut.register(accelerator, callback);
  if (!ok) {
    console.error(`[hotkey] Failed to register: ${accelerator}`);
  } else {
    console.log(`[hotkey] Registered: ${accelerator}`);
  }
}
const store = new Store({
  defaults: {
    themeId: "atom-dark",
    hotkeys: {
      toggleOverlay: "Alt+T",
      moveUp: "Alt+Up",
      moveDown: "Alt+Down",
      moveLeft: "Alt+Left",
      moveRight: "Alt+Right",
      takeScreenshot: "Alt+S",
      toggleAudio: "Alt+A",
      resetChat: "Alt+R"
    },
    moveStepPx: 50,
    windowOpacity: 0.85
  }
});
let mainWindow = null;
let pendingResponseTimer = null;
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
  registerAllHotkeys(mainWindow, store);
}
function registerIpcHandlers() {
  electron.ipcMain.handle("get-settings", () => {
    return store.store;
  });
  electron.ipcMain.on("update-settings", (_event, partial) => {
    const oldHotkeys = JSON.stringify(store.get("hotkeys"));
    for (const [key, value] of Object.entries(partial)) {
      if (key === "hotkeys" && typeof value === "object") {
        const current = store.get("hotkeys");
        store.set("hotkeys", { ...current, ...value });
      } else {
        store.set(key, value);
      }
    }
    const newHotkeys = JSON.stringify(store.get("hotkeys"));
    if (oldHotkeys !== newHotkeys && mainWindow) {
      reregisterHotkeys(mainWindow, store);
    }
    if (mainWindow) {
      mainWindow.webContents.send("settings-changed", store.store);
    }
  });
  electron.ipcMain.handle("get-theme-id", () => {
    return store.get("themeId", "atom-dark");
  });
  electron.ipcMain.on("set-theme-id", (_event, themeId) => {
    store.set("themeId", themeId);
  });
  electron.ipcMain.handle("take-screenshot", async () => {
    if (!mainWindow) throw new Error("No window");
    return captureScreen(mainWindow);
  });
  electron.ipcMain.on("send-message", (_event, message) => {
    console.log("[ipc] Received message:", message);
    if (mainWindow) {
      pendingResponseTimer = setTimeout(() => {
        mainWindow.webContents.send(
          "chat-response",
          `You said: "${message}"

(Placeholder — backend integration coming soon.)`
        );
        pendingResponseTimer = null;
      }, 600);
    }
  });
  electron.ipcMain.on("cancel-response", () => {
    if (pendingResponseTimer) {
      clearTimeout(pendingResponseTimer);
      pendingResponseTimer = null;
      console.log("[ipc] Response cancelled");
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
