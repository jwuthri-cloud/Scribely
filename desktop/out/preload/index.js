"use strict";
const electron = require("electron");
const api = {
  // ── Visibility ──────────────────────────────────
  onToggleVisibility: (callback) => {
    const handler = (_event, visible) => {
      callback(visible);
    };
    electron.ipcRenderer.on("toggle-visibility", handler);
    return () => electron.ipcRenderer.removeListener("toggle-visibility", handler);
  },
  // ── Chat ────────────────────────────────────────
  sendMessage: (message) => {
    electron.ipcRenderer.send("send-message", message);
  },
  onMessage: (callback) => {
    const handler = (_event, response) => {
      callback(response);
    };
    electron.ipcRenderer.on("chat-response", handler);
    return () => electron.ipcRenderer.removeListener("chat-response", handler);
  },
  cancelResponse: () => {
    electron.ipcRenderer.send("cancel-response");
  },
  // ── Settings ────────────────────────────────────
  getSettings: () => {
    return electron.ipcRenderer.invoke("get-settings");
  },
  updateSettings: (partial) => {
    electron.ipcRenderer.send("update-settings", partial);
  },
  onSettingsChanged: (callback) => {
    const handler = (_event, settings) => {
      callback(settings);
    };
    electron.ipcRenderer.on("settings-changed", handler);
    return () => electron.ipcRenderer.removeListener("settings-changed", handler);
  },
  // ── Legacy theme ────────────────────────────────
  getThemeId: () => {
    return electron.ipcRenderer.invoke("get-theme-id");
  },
  setThemeId: (themeId) => {
    electron.ipcRenderer.send("set-theme-id", themeId);
  },
  // ── Screenshot ──────────────────────────────────
  takeScreenshot: () => {
    return electron.ipcRenderer.invoke("take-screenshot");
  },
  onScreenshotTaken: (callback) => {
    const handler = (_event, dataUrl) => {
      callback(dataUrl);
    };
    electron.ipcRenderer.on("screenshot-taken", handler);
    return () => electron.ipcRenderer.removeListener("screenshot-taken", handler);
  },
  // ── Audio ───────────────────────────────────────
  onToggleAudio: (callback) => {
    const handler = () => callback();
    electron.ipcRenderer.on("toggle-audio", handler);
    return () => electron.ipcRenderer.removeListener("toggle-audio", handler);
  },
  // ── Reset chat ──────────────────────────────────
  onResetChat: (callback) => {
    const handler = () => callback();
    electron.ipcRenderer.on("reset-chat", handler);
    return () => electron.ipcRenderer.removeListener("reset-chat", handler);
  },
  // ── App lifecycle ───────────────────────────────
  quit: () => {
    electron.ipcRenderer.send("app-quit");
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", api);
