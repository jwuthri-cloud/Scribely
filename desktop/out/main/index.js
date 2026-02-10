"use strict";
const electron = require("electron");
const path = require("path");
const Store = require("electron-store");
const promises = require("fs/promises");
const crypto = require("crypto");
const fs = require("fs");
const events = require("events");
const https = require("https");
const http = require("http");
const os = require("os");
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
const MODELS = {
  "whisper-base.en": {
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    filename: "ggml-base.en.bin",
    size: 142e6
    // ~142MB
  },
  "whisper-small.en": {
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
    filename: "ggml-small.en.bin",
    size: 488e6
    // ~488MB
  },
  "whisper-medium.en": {
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
    filename: "ggml-medium.en.bin",
    size: 153e7
    // ~1.5GB
  },
  "whisper-large-v3-turbo": {
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
    filename: "ggml-large-v3-turbo.bin",
    size: 162e7
    // ~1.6GB
  },
  "silero-vad-v5": {
    url: "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx",
    filename: "silero_vad_v5.onnx",
    size: 23e5
    // ~2.3MB
  }
};
class ModelManager extends events.EventEmitter {
  modelsDir;
  downloading = /* @__PURE__ */ new Set();
  progressMap = /* @__PURE__ */ new Map();
  constructor() {
    super();
    this.modelsDir = path.join(electron.app.getPath("userData"), "models");
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }
  getModelPath(modelId) {
    const model = MODELS[modelId];
    const filepath = path.join(this.modelsDir, model.filename);
    return fs.existsSync(filepath) ? filepath : null;
  }
  isModelAvailable(modelId) {
    return this.getModelPath(modelId) !== null;
  }
  isDownloading(modelId) {
    return this.downloading.has(modelId);
  }
  getDownloadProgress(modelId) {
    return this.progressMap.get(modelId) || 0;
  }
  async downloadModel(modelId) {
    const model = MODELS[modelId];
    const filepath = path.join(this.modelsDir, model.filename);
    if (fs.existsSync(filepath)) {
      return filepath;
    }
    if (this.downloading.has(modelId)) {
      throw new Error(`Model ${modelId} is already being downloaded`);
    }
    this.downloading.add(modelId);
    return new Promise((resolve, reject) => {
      const tmpPath = filepath + ".tmp";
      const file = fs.createWriteStream(tmpPath);
      let downloaded = 0;
      const doRequest = (url) => {
        const client = url.startsWith("https") ? https : http;
        client.get(url, (response) => {
          if ((response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) && response.headers.location) {
            doRequest(response.headers.location);
            return;
          }
          if (response.statusCode !== 200) {
            this.downloading.delete(modelId);
            reject(new Error(`Download failed: HTTP ${response.statusCode}`));
            return;
          }
          const totalSize = parseInt(
            response.headers["content-length"] || String(model.size),
            10
          );
          response.on("data", (chunk) => {
            downloaded += chunk.length;
            const progress = Math.round(downloaded / totalSize * 100);
            this.progressMap.set(modelId, progress);
            this.emit("progress", {
              modelId,
              progress,
              downloaded,
              totalSize
            });
          });
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            try {
              const fs2 = require("fs");
              fs2.renameSync(tmpPath, filepath);
            } catch {
              try {
                const fs2 = require("fs");
                fs2.copyFileSync(tmpPath, filepath);
                fs2.unlinkSync(tmpPath);
              } catch (copyErr) {
                this.downloading.delete(modelId);
                reject(copyErr);
                return;
              }
            }
            this.downloading.delete(modelId);
            this.progressMap.delete(modelId);
            this.emit("complete", { modelId, path: filepath });
            console.log(`[model-manager] Downloaded ${modelId} to ${filepath}`);
            resolve(filepath);
          });
          file.on("error", (err) => {
            this.downloading.delete(modelId);
            try {
              fs.unlinkSync(tmpPath);
            } catch {
            }
            reject(err);
          });
        }).on("error", (err) => {
          this.downloading.delete(modelId);
          try {
            fs.unlinkSync(tmpPath);
          } catch {
          }
          reject(err);
        });
      };
      doRequest(model.url);
    });
  }
}
const PROVIDER_MODEL_MAP$1 = {
  "local-fast": "whisper-small.en",
  "local-balanced": "whisper-medium.en",
  "local-accurate": "whisper-large-v3-turbo"
};
function pcmToWav(pcm, sampleRate) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    buffer.writeInt16LE(Math.round(s < 0 ? s * 32768 : s * 32767), 44 + i * 2);
  }
  return buffer;
}
class Transcriber {
  modelManager;
  whisper = null;
  config;
  tmpDir;
  _mode = "local-fast";
  _activeModelId = null;
  constructor(modelManager, config) {
    this.modelManager = modelManager;
    this.config = { ...config };
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "assistme-audio-"));
  }
  get mode() {
    return this._mode;
  }
  get provider() {
    return this.config.provider;
  }
  /** Model ID needed for current local provider (null for cloud providers) */
  get requiredModelId() {
    return PROVIDER_MODEL_MAP$1[this.config.provider] || null;
  }
  // ── Initialization ───────────────────────────────────────
  async init() {
    await this._initProvider(this.config.provider);
  }
  async _initProvider(provider) {
    if (this.whisper && this._activeModelId) {
      try {
        ;
        this.whisper.free?.();
      } catch {
      }
      this.whisper = null;
      this._activeModelId = null;
    }
    const modelId = PROVIDER_MODEL_MAP$1[provider];
    if (modelId) {
      const modelPath = this.modelManager.getModelPath(modelId);
      if (modelPath) {
        try {
          const mod = require("smart-whisper");
          const SmartWhisper = mod.default || mod.Whisper || mod;
          this.whisper = new SmartWhisper(modelPath, { gpu: true });
          this._activeModelId = modelId;
          this._mode = provider;
          console.log(`[transcriber] Local whisper initialized: ${modelId} (Metal)`);
        } catch (err) {
          console.warn("[transcriber] smart-whisper load failed:", err);
          this._mode = provider;
        }
      } else {
        console.log(`[transcriber] Model ${modelId} not downloaded yet`);
        this._mode = provider;
      }
    } else {
      this._mode = provider;
      console.log(`[transcriber] Using cloud provider: ${provider}`);
    }
  }
  // ── Hot-swap provider at runtime ─────────────────────────
  async setProvider(provider, apiKeys) {
    this.config.provider = provider;
    this.config.apiKeys = { ...apiKeys };
    await this._initProvider(provider);
  }
  // ── Re-init (e.g. after model download) ──────────────────
  async reinit() {
    await this._initProvider(this.config.provider);
  }
  // ── Main transcription entry point ───────────────────────
  async transcribe(pcm, sampleRate = 16e3) {
    const duration = pcm.length / sampleRate;
    let sumSquares = 0;
    for (let i = 0; i < pcm.length; i++) {
      sumSquares += pcm[i] * pcm[i];
    }
    const rms = Math.sqrt(sumSquares / pcm.length);
    if (rms < 5e-3) {
      return { text: "", duration };
    }
    const provider = this.config.provider;
    if (provider.startsWith("local-")) {
      if (this.whisper) {
        return this._transcribeLocal(pcm, duration);
      }
      return { text: "", duration };
    }
    if (provider === "groq") {
      return this._transcribeGroq(pcm, sampleRate, duration);
    }
    if (provider === "deepgram") {
      return this._transcribeDeepgram(pcm, sampleRate, duration);
    }
    return { text: "", duration };
  }
  // ── Local whisper.cpp ────────────────────────────────────
  async _transcribeLocal(pcm, duration) {
    try {
      const task = await this.whisper.transcribe(pcm, {
        language: "en"
      });
      const segments = await task.result;
      const text = Array.isArray(segments) ? segments.map((s) => s.text || "").join(" ") : typeof segments === "string" ? segments : "";
      return { text: text.trim(), duration };
    } catch (err) {
      console.error("[transcriber] Local transcription failed:", err);
      return { text: "", duration };
    }
  }
  // ── Groq (OpenAI-compatible API) ─────────────────────────
  async _transcribeGroq(pcm, sampleRate, duration) {
    const apiKey = this.config.apiKeys.groq;
    if (!apiKey) {
      return { text: "", duration };
    }
    const wav = pcmToWav(pcm, sampleRate);
    try {
      const formData = new FormData();
      const blob = new Blob([wav], { type: "audio/wav" });
      formData.append("file", blob, "audio.wav");
      formData.append("model", "whisper-large-v3");
      formData.append("response_format", "text");
      const res = await fetch(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData
        }
      );
      if (!res.ok) {
        const msg = await res.text();
        console.error("[transcriber] Groq API error:", msg);
        return { text: "", duration };
      }
      const text = (await res.text()).trim();
      return { text, duration };
    } catch (err) {
      console.error("[transcriber] Groq transcription failed:", err);
      return { text: "", duration };
    }
  }
  // ── Deepgram Nova-3 ──────────────────────────────────────
  async _transcribeDeepgram(pcm, sampleRate, duration) {
    const apiKey = this.config.apiKeys.deepgram;
    if (!apiKey) {
      return { text: "", duration };
    }
    const wav = pcmToWav(pcm, sampleRate);
    try {
      const res = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": "audio/wav"
          },
          body: wav
        }
      );
      if (!res.ok) {
        const msg = await res.text();
        console.error("[transcriber] Deepgram API error:", msg);
        return { text: "", duration };
      }
      const json = await res.json();
      const text = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
      return { text: text.trim(), duration };
    } catch (err) {
      console.error("[transcriber] Deepgram transcription failed:", err);
      return { text: "", duration };
    }
  }
  // ── Cleanup ──────────────────────────────────────────────
  destroy() {
    if (this.whisper) {
      try {
        ;
        this.whisper.free?.();
      } catch {
      }
    }
    try {
      const fs2 = require("fs");
      const files = fs2.readdirSync(this.tmpDir);
      for (const file of files) {
        fs2.unlinkSync(path.join(this.tmpDir, file));
      }
      fs2.rmdirSync(this.tmpDir);
    } catch {
    }
  }
}
const VAD_FRAME_SIZE = 512;
const VAD_SAMPLE_RATE$1 = 16e3;
const FRAME_DURATION_MS = VAD_FRAME_SIZE / VAD_SAMPLE_RATE$1 * 1e3;
const STATE_DIM = 128;
const START_THRESHOLD = 0.5;
const END_THRESHOLD = 0.35;
const MIN_SPEECH_FRAMES = Math.ceil(250 / FRAME_DURATION_MS);
const MIN_SILENCE_FRAMES = Math.ceil(100 / FRAME_DURATION_MS);
const PRE_SPEECH_PADDING_FRAMES = Math.ceil(100 / FRAME_DURATION_MS);
const MIN_CONFIRM_FRAMES = 2;
function resample(pcm, fromRate, toRate) {
  if (fromRate === toRate) return pcm;
  const ratio = fromRate / toRate;
  const outputLength = Math.round(pcm.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcFloor = Math.floor(srcIndex);
    const srcCeil = Math.min(srcFloor + 1, pcm.length - 1);
    const frac = srcIndex - srcFloor;
    output[i] = pcm[srcFloor] * (1 - frac) + pcm[srcCeil] * frac;
  }
  return output;
}
class VoiceActivityDetector extends events.EventEmitter {
  // ONNX Runtime (lazily loaded — typed as any because we require() at runtime)
  ort = null;
  session = null;
  // Model state tensors
  state = null;
  // ort.Tensor [2, 1, 128]
  srTensor = null;
  // ort.Tensor [1]
  // Speech detection state
  isSpeaking = false;
  speechStartFrame = 0;
  frameCount = 0;
  speechFrames = [];
  preSpeechBuffer = [];
  // circular buffer for pre-speech context
  consecutiveSpeechFrames = 0;
  consecutiveSilenceFrames = 0;
  // Leftover samples from previous processChunk call (< 512)
  leftover = null;
  // Instance config
  source;
  constructor(source) {
    super();
    this.source = source;
  }
  get isReady() {
    return this.session !== null;
  }
  // ── Initialization ─────────────────────────────────────
  async init(modelPath) {
    try {
      this.ort = require("onnxruntime-node");
      this.session = await this.ort.InferenceSession.create(modelPath, {
        executionProviders: ["cpu"]
      });
      this._resetState();
      console.log(`[vad:${this.source}] Silero VAD v5 initialized (${modelPath})`);
      return true;
    } catch (err) {
      console.warn(`[vad:${this.source}] Init failed — VAD disabled:`, err);
      this.session = null;
      return false;
    }
  }
  _resetState() {
    if (!this.ort) return;
    this.state = new this.ort.Tensor(
      "float32",
      new Float32Array(2 * 1 * STATE_DIM),
      [2, 1, STATE_DIM]
    );
    this.srTensor = new this.ort.Tensor(
      "int64",
      BigInt64Array.from([BigInt(VAD_SAMPLE_RATE$1)]),
      [1]
    );
    this.isSpeaking = false;
    this.speechFrames = [];
    this.preSpeechBuffer = [];
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.speechStartFrame = 0;
    this.frameCount = 0;
    this.leftover = null;
  }
  // ── Public: process a chunk of audio (any size, any rate) ─
  /**
   * Feed a chunk of PCM audio to the VAD.
   * Automatically resamples to 16kHz and splits into 512-sample frames.
   * Emits 'speech-segment' events when speech is detected and ends.
   */
  async processChunk(pcm, sampleRate) {
    if (!this.session) return;
    let audio = sampleRate !== VAD_SAMPLE_RATE$1 ? resample(pcm, sampleRate, VAD_SAMPLE_RATE$1) : pcm;
    if (this.leftover) {
      const merged = new Float32Array(this.leftover.length + audio.length);
      merged.set(this.leftover);
      merged.set(audio, this.leftover.length);
      audio = merged;
      this.leftover = null;
    }
    let offset = 0;
    while (offset + VAD_FRAME_SIZE <= audio.length) {
      const frame = audio.subarray(offset, offset + VAD_FRAME_SIZE);
      await this._processFrame(frame);
      offset += VAD_FRAME_SIZE;
    }
    if (offset < audio.length) {
      this.leftover = new Float32Array(audio.subarray(offset));
    }
  }
  // ── Core frame processing with hysteresis ──────────────
  async _processFrame(frame) {
    const probability = await this._infer(frame);
    if (probability < 0) return;
    this.frameCount++;
    if (!this.isSpeaking) {
      this._handleNonSpeech(frame, probability);
    } else {
      this._handleSpeech(frame, probability);
    }
  }
  _handleNonSpeech(frame, probability) {
    this.preSpeechBuffer.push(new Float32Array(frame));
    while (this.preSpeechBuffer.length > PRE_SPEECH_PADDING_FRAMES) {
      this.preSpeechBuffer.shift();
    }
    if (probability >= START_THRESHOLD) {
      this.consecutiveSpeechFrames++;
      if (this.consecutiveSpeechFrames >= MIN_CONFIRM_FRAMES) {
        this.isSpeaking = true;
        this.speechStartFrame = this.frameCount - this.preSpeechBuffer.length;
        if (this.speechStartFrame < 0) this.speechStartFrame = 0;
        this.speechFrames = [...this.preSpeechBuffer];
        this.preSpeechBuffer = [];
        this.consecutiveSilenceFrames = 0;
        this.emit("speech-start", {
          time: Math.max(0, this.speechStartFrame * FRAME_DURATION_MS),
          source: this.source
        });
      }
    } else {
      this.consecutiveSpeechFrames = 0;
    }
  }
  _handleSpeech(frame, probability) {
    this.speechFrames.push(new Float32Array(frame));
    if (probability < END_THRESHOLD) {
      this.consecutiveSilenceFrames++;
      if (this.consecutiveSilenceFrames >= MIN_SILENCE_FRAMES) {
        this._emitSegment();
        this.isSpeaking = false;
        this.speechFrames = [];
        this.preSpeechBuffer = [];
        this.consecutiveSpeechFrames = 0;
        this.consecutiveSilenceFrames = 0;
      }
    } else {
      this.consecutiveSilenceFrames = 0;
    }
  }
  // ── Emit accumulated speech as a segment ───────────────
  _emitSegment() {
    const numFrames = this.speechFrames.length;
    const speechDurationMs = numFrames * FRAME_DURATION_MS;
    if (speechDurationMs < MIN_SPEECH_FRAMES * FRAME_DURATION_MS) {
      return;
    }
    const totalSamples = numFrames * VAD_FRAME_SIZE;
    const audio = new Float32Array(totalSamples);
    for (let i = 0; i < numFrames; i++) {
      audio.set(this.speechFrames[i], i * VAD_FRAME_SIZE);
    }
    const startTime = Math.max(0, this.speechStartFrame * FRAME_DURATION_MS);
    const endTime = startTime + speechDurationMs;
    this.emit("speech-segment", {
      audio,
      startTime,
      endTime,
      source: this.source
    });
  }
  // ── ONNX inference ─────────────────────────────────────
  async _infer(frame) {
    if (!this.session || !this.ort) return -1;
    try {
      const inputTensor = new this.ort.Tensor("float32", frame, [1, VAD_FRAME_SIZE]);
      const feeds = {
        input: inputTensor,
        state: this.state,
        sr: this.srTensor
      };
      const results = await this.session.run(feeds);
      const outputKeys = Object.keys(results);
      const probTensor = results["output"] || results[outputKeys[0]];
      const newState = results["stateN"] || results[outputKeys[1]];
      this.state = newState;
      return probTensor.data[0];
    } catch (err) {
      console.error(`[vad:${this.source}] Inference error:`, err);
      return -1;
    }
  }
  // ── Flush remaining speech (call when session ends) ────
  flush() {
    if (this.isSpeaking && this.speechFrames.length > 0) {
      this._emitSegment();
    }
    this._resetState();
  }
  // ── Cleanup ────────────────────────────────────────────
  destroy() {
    this.flush();
    this.session = null;
    this.ort = null;
    this.removeAllListeners();
  }
}
const PROVIDER_MODEL_MAP = {
  "local-fast": "whisper-small.en",
  "local-balanced": "whisper-medium.en",
  "local-accurate": "whisper-large-v3-turbo"
};
const VAD_MODEL_ID = "silero-vad-v5";
const VAD_SAMPLE_RATE = 16e3;
class AudioPipeline {
  modelManager;
  transcriber;
  window = null;
  isActive = false;
  sessionStartTime = 0;
  // ── Per-stream VAD instances ───────────────────────────
  micVad = null;
  tabVad = null;
  vadReady = false;
  // ── Transcription segment queue ───────────────────────
  segmentQueue = [];
  isProcessingQueue = false;
  // ── Fallback buffer (when VAD is not available) ───────
  fallbackBuffers = /* @__PURE__ */ new Map();
  static FALLBACK_CHUNK_SECONDS = 3;
  constructor(transcriptionSettings) {
    this.modelManager = new ModelManager();
    this.transcriber = new Transcriber(this.modelManager, {
      provider: transcriptionSettings.provider,
      apiKeys: transcriptionSettings.apiKeys
    });
    this.modelManager.on("progress", (data) => {
      this.sendToRenderer("meeting:model-progress", data);
    });
    this.modelManager.on("complete", async (data) => {
      this.sendToRenderer("meeting:model-complete", data);
      if (data.modelId !== VAD_MODEL_ID) {
        await this.transcriber.reinit();
        this.sendToRenderer("meeting:status-update", {
          transcriptionMode: this.transcriber.mode
        });
      }
      if (data.modelId === VAD_MODEL_ID) {
        await this._initVad();
        this.sendToRenderer("meeting:status-update", {
          vadReady: this.vadReady
        });
      }
    });
  }
  // ── Initialization ─────────────────────────────────────
  async init() {
    await this.transcriber.init();
    await this._initVad();
    console.log(
      `[pipeline] Initialized — transcription: ${this.transcriber.mode}, VAD: ${this.vadReady ? "ready" : "unavailable"}`
    );
  }
  /** Initialize per-stream VAD instances if the model is available */
  async _initVad() {
    const modelPath = this.modelManager.getModelPath(VAD_MODEL_ID);
    if (!modelPath) {
      console.log("[pipeline] VAD model not downloaded yet — streaming without VAD");
      this.vadReady = false;
      return;
    }
    this.micVad = new VoiceActivityDetector("mic");
    this.tabVad = new VoiceActivityDetector("system");
    const [micOk, tabOk] = await Promise.all([
      this.micVad.init(modelPath),
      this.tabVad.init(modelPath)
    ]);
    if (micOk && tabOk) {
      this.vadReady = true;
      this.micVad.on("speech-segment", (seg) => this._enqueueSpeech(seg));
      this.tabVad.on("speech-segment", (seg) => this._enqueueSpeech(seg));
      console.log("[pipeline] Per-stream VAD ready (mic + tab)");
    } else {
      console.warn("[pipeline] VAD init failed — falling back to chunk-based pipeline");
      this.micVad?.destroy();
      this.tabVad?.destroy();
      this.micVad = null;
      this.tabVad = null;
      this.vadReady = false;
    }
  }
  setWindow(window) {
    this.window = window;
  }
  // ── Settings changed ───────────────────────────────────
  async onSettingsChanged(settings) {
    const provider = settings.provider;
    console.log(`[pipeline] Transcription provider changed to: ${provider}`);
    await this.transcriber.setProvider(provider, settings.apiKeys);
    const modelId = PROVIDER_MODEL_MAP[provider];
    if (modelId) {
      this._autoDownloadModel(modelId);
    }
    this.sendToRenderer("meeting:status-update", {
      transcriptionMode: this.transcriber.mode
    });
  }
  /** Auto-download a model if not present */
  _autoDownloadModel(modelId) {
    if (!this.modelManager.isModelAvailable(modelId) && !this.modelManager.isDownloading(modelId)) {
      console.log(`[pipeline] Model ${modelId} not found — starting auto-download`);
      this.sendToRenderer("meeting:status-update", {
        transcriptionMode: modelId === VAD_MODEL_ID ? this.transcriber.mode : "downloading"
      });
      this.modelManager.downloadModel(modelId).then(async () => {
        if (modelId !== VAD_MODEL_ID) {
          await this.transcriber.reinit();
        }
        console.log(`[pipeline] Model ${modelId} ready`);
      }).catch((err) => {
        console.error(`[pipeline] Auto-download of ${modelId} failed:`, err);
      });
    }
  }
  // ── Speech Segment Queue ───────────────────────────────
  /** Add a VAD-detected speech segment to the transcription queue */
  _enqueueSpeech(segment) {
    if (!this.isActive) return;
    this.segmentQueue.push(segment);
    this._drainQueue();
  }
  /** Process the transcription queue sequentially */
  async _drainQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    while (this.segmentQueue.length > 0) {
      const segment = this.segmentQueue.shift();
      await this._transcribeSegment(segment);
    }
    this.isProcessingQueue = false;
  }
  /** Transcribe a single speech segment and emit the result */
  async _transcribeSegment(segment) {
    try {
      const result = await this.transcriber.transcribe(segment.audio, VAD_SAMPLE_RATE);
      if (!result.text) return;
      const entry = {
        id: crypto.randomUUID(),
        speaker: segment.source === "mic" ? "You" : "Them",
        text: result.text,
        startTime: segment.startTime,
        endTime: segment.endTime,
        confidence: 1,
        source: segment.source,
        isEdited: false
      };
      this.sendToRenderer("meeting:transcript-entry", entry);
    } catch (err) {
      console.error("[pipeline] Transcription of speech segment failed:", err);
    }
  }
  // ── Fallback: chunk-based pipeline (no VAD) ────────────
  /**
   * When VAD is not available, accumulate frames into 3-second chunks
   * and transcribe them directly (Phase 1 behavior).
   */
  async _handleFallbackFrame(source, pcm, sampleRate, timestamp) {
    if (!this.fallbackBuffers.has(source)) {
      this.fallbackBuffers.set(source, { frames: [], samples: 0 });
    }
    const buf = this.fallbackBuffers.get(source);
    buf.frames.push(pcm);
    buf.samples += pcm.length;
    const chunkSamples = sampleRate * AudioPipeline.FALLBACK_CHUNK_SECONDS;
    if (buf.samples >= chunkSamples) {
      const combined = new Float32Array(buf.samples);
      let offset = 0;
      for (const frame of buf.frames) {
        combined.set(frame, offset);
        offset += frame.length;
      }
      buf.frames = [];
      buf.samples = 0;
      if (combined.length < sampleRate * 0.3) return;
      const result = await this.transcriber.transcribe(combined, sampleRate);
      if (result.text) {
        const entry = {
          id: crypto.randomUUID(),
          speaker: source === "mic" ? "You" : "Them",
          text: result.text,
          startTime: this.isActive ? timestamp - this.sessionStartTime : 0,
          endTime: this.isActive ? timestamp - this.sessionStartTime + result.duration * 1e3 : result.duration * 1e3,
          confidence: 1,
          source,
          isEdited: false
        };
        if (this.isActive) {
          this.sendToRenderer("meeting:transcript-entry", entry);
        }
      }
    }
  }
  /** Flush remaining fallback buffers */
  async _flushFallbackBuffers() {
    for (const [source, buf] of this.fallbackBuffers.entries()) {
      if (buf.samples > 0) {
        const combined = new Float32Array(buf.samples);
        let offset = 0;
        for (const frame of buf.frames) {
          combined.set(frame, offset);
          offset += frame.length;
        }
        buf.frames = [];
        buf.samples = 0;
        if (combined.length < 16e3 * 0.3) continue;
        const result = await this.transcriber.transcribe(combined, 16e3);
        if (result.text && this.isActive) {
          const entry = {
            id: crypto.randomUUID(),
            speaker: source === "mic" ? "You" : "Them",
            text: result.text,
            startTime: 0,
            endTime: result.duration * 1e3,
            confidence: 1,
            source,
            isEdited: false
          };
          this.sendToRenderer("meeting:transcript-entry", entry);
        }
      }
    }
  }
  // ── IPC Handlers ───────────────────────────────────────
  registerIpcHandlers() {
    electron.ipcMain.handle("meeting:start-session", async () => {
      const whisperModelId = this.transcriber.requiredModelId;
      if (whisperModelId) {
        this._autoDownloadModel(whisperModelId);
      }
      this._autoDownloadModel(VAD_MODEL_ID);
      this.isActive = true;
      this.sessionStartTime = Date.now();
      this.segmentQueue = [];
      this.isProcessingQueue = false;
      this.fallbackBuffers.clear();
      this.micVad?.flush();
      this.tabVad?.flush();
      console.log(
        `[pipeline] Meeting session started (VAD: ${this.vadReady ? "enabled" : "fallback-chunk"})`
      );
      return {
        sessionId: crypto.randomUUID(),
        transcriptionMode: this.transcriber.mode,
        vadEnabled: this.vadReady
      };
    });
    electron.ipcMain.handle("meeting:stop-session", async () => {
      this.micVad?.flush();
      this.tabVad?.flush();
      await this._drainQueue();
      await this._flushFallbackBuffers();
      this.isActive = false;
      this.segmentQueue = [];
      this.fallbackBuffers.clear();
      console.log("[pipeline] Meeting session stopped");
      return { success: true };
    });
    electron.ipcMain.on(
      "meeting:audio-frame",
      (_event, payload) => {
        if (!this.isActive) return;
        const pcm = new Float32Array(payload.pcm);
        if (pcm.length === 0) return;
        const vad = payload.source === "mic" ? this.micVad : this.tabVad;
        if (vad && this.vadReady) {
          vad.processChunk(pcm, payload.sampleRate).catch((err) => {
            console.error(`[pipeline] VAD processing error (${payload.source}):`, err);
          });
        } else {
          this._handleFallbackFrame(
            payload.source,
            pcm,
            payload.sampleRate,
            payload.timestamp
          ).catch((err) => {
            console.error(`[pipeline] Fallback transcription error:`, err);
          });
        }
      }
    );
    electron.ipcMain.handle(
      "meeting:transcribe-chunk",
      async (_event, payload) => {
        const modelId = this.transcriber.requiredModelId;
        if (modelId) {
          this._autoDownloadModel(modelId);
        }
        const pcm = new Float32Array(payload.pcm);
        if (pcm.length < payload.sampleRate * 0.3) return null;
        const result = await this.transcriber.transcribe(pcm, payload.sampleRate);
        if (result.text) {
          const entry = {
            id: crypto.randomUUID(),
            speaker: payload.source === "mic" ? "You" : "Them",
            text: result.text,
            startTime: this.isActive ? payload.timestamp - this.sessionStartTime : 0,
            endTime: this.isActive ? payload.timestamp - this.sessionStartTime + result.duration * 1e3 : result.duration * 1e3,
            confidence: 1,
            source: payload.source,
            isEdited: false
          };
          if (this.isActive) {
            this.sendToRenderer("meeting:transcript-entry", entry);
          }
          return entry;
        }
        return null;
      }
    );
    electron.ipcMain.handle("meeting:get-model-status", () => {
      const whisperModelId = this.transcriber.requiredModelId;
      return {
        whisperModel: {
          available: whisperModelId ? this.modelManager.isModelAvailable(whisperModelId) : true,
          downloading: whisperModelId ? this.modelManager.isDownloading(whisperModelId) : false,
          progress: whisperModelId ? this.modelManager.getDownloadProgress(whisperModelId) : 0,
          path: whisperModelId ? this.modelManager.getModelPath(whisperModelId) : null,
          modelId: whisperModelId || null
        },
        vadModel: {
          available: this.modelManager.isModelAvailable(VAD_MODEL_ID),
          downloading: this.modelManager.isDownloading(VAD_MODEL_ID),
          progress: this.modelManager.getDownloadProgress(VAD_MODEL_ID),
          ready: this.vadReady
        }
      };
    });
    electron.ipcMain.handle("meeting:download-model", async () => {
      const modelId = this.transcriber.requiredModelId;
      if (!modelId) {
        return { success: true, mode: this.transcriber.mode };
      }
      try {
        const path2 = await this.modelManager.downloadModel(modelId);
        await this.transcriber.reinit();
        return { success: true, path: path2, mode: this.transcriber.mode };
      } catch (err) {
        console.error("[pipeline] Model download failed:", err);
        return { success: false, error: String(err) };
      }
    });
    electron.ipcMain.handle(
      "meeting:save-recording",
      async (_event, payload) => {
        const dir = path.join(electron.app.getPath("documents"), "AssistMe", "recordings");
        await promises.mkdir(dir, { recursive: true });
        const ext = payload.mimeType.includes("webm") ? "webm" : "mp4";
        const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
        const filename = `meeting-${timestamp}.${ext}`;
        const filepath = path.join(dir, filename);
        await promises.writeFile(filepath, Buffer.from(payload.data));
        console.log(`[pipeline] Recording saved: ${filepath}`);
        return { filepath, filename };
      }
    );
  }
  // ── Helpers ────────────────────────────────────────────
  sendToRenderer(channel, data) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data);
    }
  }
  destroy() {
    this.micVad?.destroy();
    this.tabVad?.destroy();
    this.transcriber.destroy();
    this.segmentQueue = [];
    this.fallbackBuffers.clear();
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
    windowOpacity: 0.85,
    transcription: {
      provider: "local-fast",
      apiKeys: {}
    }
  }
});
let mainWindow = null;
let pendingResponseTimer = null;
let isInvisible = true;
const audioPipeline = new AudioPipeline(store.get("transcription"));
electron.app.commandLine.appendSwitch(
  "enable-features",
  [
    "MacLoopbackAudioForScreenShare",
    "MacSckSystemAudioLoopbackOverride",
    "ScreenCaptureKitStreamPickerSonoma",
    "ScreenCaptureKitAudio"
  ].join(",")
);
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
  electron.session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await electron.desktopCapturer.getSources({ types: ["screen"] });
      const primaryScreen = sources[0];
      if (primaryScreen) {
        console.log("[display-media] Auto-selecting screen with loopback audio");
        callback({ video: primaryScreen, audio: "loopback" });
      } else {
        console.warn("[display-media] No screen sources found");
        callback({});
      }
    } catch (err) {
      console.error("[display-media] Handler error:", err);
      callback({});
    }
  });
  audioPipeline.setWindow(mainWindow);
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
      } else if (key === "transcription" && typeof value === "object") {
        const current = store.get("transcription");
        const incoming = value;
        store.set("transcription", {
          ...current,
          ...incoming,
          apiKeys: { ...current.apiKeys, ...incoming.apiKeys }
        });
      } else {
        store.set(key, value);
      }
    }
    const newHotkeys = JSON.stringify(store.get("hotkeys"));
    if (oldHotkeys !== newHotkeys && mainWindow) {
      reregisterHotkeys(mainWindow, store);
    }
    if (partial.transcription) {
      audioPipeline.onSettingsChanged(store.get("transcription"));
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
  electron.ipcMain.handle("toggle-invisibility", () => {
    if (!mainWindow) return isInvisible;
    isInvisible = !isInvisible;
    mainWindow.setContentProtection(isInvisible);
    return isInvisible;
  });
  electron.ipcMain.handle("get-invisibility", () => {
    return isInvisible;
  });
  electron.ipcMain.on("app-quit", () => {
    electron.app.quit();
  });
}
electron.app.whenReady().then(async () => {
  if (process.platform === "darwin") {
    electron.app.dock.hide();
    const micStatus = electron.systemPreferences.getMediaAccessStatus("microphone");
    if (micStatus !== "granted") {
      console.log(`[permissions] Microphone status: ${micStatus} — requesting access…`);
      const granted = await electron.systemPreferences.askForMediaAccess("microphone");
      console.log(`[permissions] Microphone access ${granted ? "granted" : "denied"}`);
    }
    const screenStatus = electron.systemPreferences.getMediaAccessStatus("screen");
    console.log(`[permissions] Screen recording status: ${screenStatus}`);
  }
  registerIpcHandlers();
  audioPipeline.registerIpcHandlers();
  await audioPipeline.init();
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
  audioPipeline.destroy();
});
