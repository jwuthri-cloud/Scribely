"use strict";
const electron = require("electron");
const api = {
  onToggleVisibility: (callback) => {
    const handler = (_event, visible) => {
      callback(visible);
    };
    electron.ipcRenderer.on("toggle-visibility", handler);
    return () => {
      electron.ipcRenderer.removeListener("toggle-visibility", handler);
    };
  },
  sendMessage: (message) => {
    electron.ipcRenderer.send("send-message", message);
  },
  onMessage: (callback) => {
    const handler = (_event, response) => {
      callback(response);
    };
    electron.ipcRenderer.on("chat-response", handler);
    return () => {
      electron.ipcRenderer.removeListener("chat-response", handler);
    };
  },
  getThemeId: () => {
    return electron.ipcRenderer.invoke("get-theme-id");
  },
  setThemeId: (themeId) => {
    electron.ipcRenderer.send("set-theme-id", themeId);
  },
  quit: () => {
    electron.ipcRenderer.send("app-quit");
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", api);
