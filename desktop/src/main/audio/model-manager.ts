import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs'
import { EventEmitter } from 'events'
import { createLogger } from '../logger'

const log = createLogger('model-manager')
import https from 'https'
import http from 'http'

const MODELS = {
  'whisper-base.en': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    filename: 'ggml-base.en.bin',
    size: 142_000_000, // ~142MB
  },
  'whisper-small.en': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    filename: 'ggml-small.en.bin',
    size: 488_000_000, // ~488MB
  },
  'whisper-small': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    filename: 'ggml-small.bin',
    size: 466_000_000, // ~466MB, multilingual
  },
  'whisper-medium.en': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
    filename: 'ggml-medium.en.bin',
    size: 1_530_000_000, // ~1.5GB
  },
  'whisper-medium': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    filename: 'ggml-medium.bin',
    size: 1_530_000_000, // ~1.5GB, multilingual
  },
  'whisper-large-v3-turbo': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
    filename: 'ggml-large-v3-turbo.bin',
    size: 1_620_000_000, // ~1.6GB
  },
  'silero-vad-v5': {
    url: 'https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx',
    filename: 'silero_vad_v5.onnx',
    size: 2_300_000, // ~2.3MB
  },
} as const

type ModelId = keyof typeof MODELS

export interface ModelProgressEvent {
  modelId: string
  progress: number
  downloaded: number
  totalSize: number
}

export class ModelManager extends EventEmitter {
  private modelsDir: string
  private downloading = new Set<string>()
  private progressMap = new Map<string, number>()

  constructor() {
    super()
    this.modelsDir = join(app.getPath('userData'), 'models')
    if (!existsSync(this.modelsDir)) {
      mkdirSync(this.modelsDir, { recursive: true })
    }
  }

  getModelPath(modelId: ModelId): string | null {
    const model = MODELS[modelId]
    const filepath = join(this.modelsDir, model.filename)
    return existsSync(filepath) ? filepath : null
  }

  isModelAvailable(modelId: ModelId): boolean {
    return this.getModelPath(modelId) !== null
  }

  isDownloading(modelId: ModelId): boolean {
    return this.downloading.has(modelId)
  }

  getDownloadProgress(modelId: ModelId): number {
    return this.progressMap.get(modelId) || 0
  }

  async downloadModel(modelId: ModelId): Promise<string> {
    const model = MODELS[modelId]
    const filepath = join(this.modelsDir, model.filename)

    if (existsSync(filepath)) {
      return filepath
    }

    if (this.downloading.has(modelId)) {
      throw new Error(`Model ${modelId} is already being downloaded`)
    }

    this.downloading.add(modelId)

    return new Promise<string>((resolve, reject) => {
      const tmpPath = filepath + '.tmp'
      const file = createWriteStream(tmpPath)
      let downloaded = 0

      const doRequest = (url: string): void => {
        const client = url.startsWith('https') ? https : http
        client
          .get(url, (response) => {
            // Handle redirects (HuggingFace + GitHub use them)
            if (
              (response.statusCode === 301 ||
                response.statusCode === 302 ||
                response.statusCode === 307) &&
              response.headers.location
            ) {
              doRequest(response.headers.location)
              return
            }

            if (response.statusCode !== 200) {
              this.downloading.delete(modelId)
              reject(new Error(`Download failed: HTTP ${response.statusCode}`))
              return
            }

            const totalSize = parseInt(
              response.headers['content-length'] || String(model.size),
              10,
            )

            response.on('data', (chunk: Buffer) => {
              downloaded += chunk.length
              const progress = Math.round((downloaded / totalSize) * 100)
              this.progressMap.set(modelId, progress)
              this.emit('progress', {
                modelId,
                progress,
                downloaded,
                totalSize,
              } satisfies ModelProgressEvent)
            })

            response.pipe(file)

            file.on('finish', () => {
              file.close()
              // Rename tmp to final path
              try {
                const fs = require('fs')
                fs.renameSync(tmpPath, filepath)
              } catch {
                // Fallback: copy and delete
                try {
                  const fs = require('fs')
                  fs.copyFileSync(tmpPath, filepath)
                  fs.unlinkSync(tmpPath)
                } catch (copyErr) {
                  this.downloading.delete(modelId)
                  reject(copyErr)
                  return
                }
              }

              this.downloading.delete(modelId)
              this.progressMap.delete(modelId)
              this.emit('complete', { modelId, path: filepath })
              log.success(`Downloaded ${modelId} to ${filepath}`)
              resolve(filepath)
            })

            file.on('error', (err) => {
              this.downloading.delete(modelId)
              try {
                unlinkSync(tmpPath)
              } catch {}
              reject(err)
            })
          })
          .on('error', (err) => {
            this.downloading.delete(modelId)
            try {
              unlinkSync(tmpPath)
            } catch {}
            reject(err)
          })
      }

      doRequest(model.url)
    })
  }
}
