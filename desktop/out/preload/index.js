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
  // ── Meeting / Transcription ─────────────────────
  startMeetingSession: () => {
    return electron.ipcRenderer.invoke("meeting:start-session");
  },
  stopMeetingSession: () => {
    return electron.ipcRenderer.invoke("meeting:stop-session");
  },
  streamAudioFrame: (payload) => {
    electron.ipcRenderer.send("meeting:audio-frame", payload);
  },
  transcribeAudioChunk: (payload) => {
    return electron.ipcRenderer.invoke("meeting:transcribe-chunk", payload);
  },
  saveMeetingRecording: (payload) => {
    return electron.ipcRenderer.invoke("meeting:save-recording", payload);
  },
  getModelStatus: () => {
    return electron.ipcRenderer.invoke("meeting:get-model-status");
  },
  downloadWhisperModel: () => {
    return electron.ipcRenderer.invoke("meeting:download-model");
  },
  onTranscriptEntry: (callback) => {
    const handler = (_event, entry) => {
      callback(entry);
    };
    electron.ipcRenderer.on("meeting:transcript-entry", handler);
    return () => electron.ipcRenderer.removeListener("meeting:transcript-entry", handler);
  },
  onMeetingStatusUpdate: (callback) => {
    const handler = (_event, update) => {
      callback(update);
    };
    electron.ipcRenderer.on("meeting:status-update", handler);
    return () => electron.ipcRenderer.removeListener("meeting:status-update", handler);
  },
  onModelProgress: (callback) => {
    const handler = (_event, data) => {
      callback(data);
    };
    electron.ipcRenderer.on("meeting:model-progress", handler);
    return () => electron.ipcRenderer.removeListener("meeting:model-progress", handler);
  },
  onModelComplete: (callback) => {
    const handler = (_event, data) => {
      callback(data);
    };
    electron.ipcRenderer.on("meeting:model-complete", handler);
    return () => electron.ipcRenderer.removeListener("meeting:model-complete", handler);
  },
  // ── Reset chat ──────────────────────────────────
  onResetChat: (callback) => {
    const handler = () => callback();
    electron.ipcRenderer.on("reset-chat", handler);
    return () => electron.ipcRenderer.removeListener("reset-chat", handler);
  },
  // ── Invisibility ──────────────────────────────
  toggleInvisibility: () => {
    return electron.ipcRenderer.invoke("toggle-invisibility");
  },
  getInvisibility: () => {
    return electron.ipcRenderer.invoke("get-invisibility");
  },
  // ── App lifecycle ───────────────────────────────
  quit: () => {
    electron.ipcRenderer.send("app-quit");
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", api);
