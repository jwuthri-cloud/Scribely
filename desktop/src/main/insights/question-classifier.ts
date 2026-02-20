/**
 * ML-based question classifier for the gray-zone (confidence 0.4–0.7).
 * Uses ONNX model + BERT tokenizer. Falls back to skipping ML gate when unavailable.
 */

import { existsSync } from 'fs'
import { createLogger } from '../logger'

const log = createLogger('question-classifier')
import { join } from 'path'
import { app } from 'electron'

const MAX_SEQ_LENGTH = 128

let ort: any = null
let session: any = null
let tokenizer: any = null

function getModelPath(): string | null {
  // Check userData/models first (downloaded)
  const userDataPath = join(app.getPath('userData'), 'models', 'question_classifier.onnx')
  if (existsSync(userDataPath)) return userDataPath
  // Check bundled resources (optimum exports as model.onnx)
  const resourcesModel = join(process.resourcesPath, 'models', 'model.onnx')
  if (existsSync(resourcesModel)) return resourcesModel
  const resourcesLegacy = join(process.resourcesPath, 'models', 'question_classifier.onnx')
  if (existsSync(resourcesLegacy)) return resourcesLegacy
  // Dev mode: check project resources/ folder (not copied by electron-vite in dev)
  const devModel = join(app.getAppPath(), 'resources', 'models', 'model.onnx')
  if (existsSync(devModel)) return devModel
  return null
}

function getTokenizerPath(): string | null {
  // Use bert-tokenizer's bundled vocab (bert-base-uncased) — model must use same vocab
  // require.resolve returns dist/index.js, so we need '..' twice to reach package root
  try {
    const pkgRoot = join(require.resolve('bert-tokenizer'), '..', '..')
    const vocabPath = join(pkgRoot, 'assets', 'vocab.json')
    if (existsSync(vocabPath)) return vocabPath
  } catch {
    // bert-tokenizer not installed
  }
  // Fallback: app-relative path (dev and packaged)
  const fallbacks = [
    join(app.getAppPath(), 'node_modules', 'bert-tokenizer', 'assets', 'vocab.json'),
    join(process.resourcesPath, '..', 'app.asar.unpacked', 'node_modules', 'bert-tokenizer', 'assets', 'vocab.json'),
  ]
  for (const p of fallbacks) {
    if (existsSync(p)) return p
  }
  return null
}

async function init(): Promise<boolean> {
  if (session && tokenizer) return true

  const modelPath = getModelPath()
  if (!modelPath) {
    log.error('Model not found (checked userData + resources), ML gate disabled')
    return false
  }

  const tokenizerPath = getTokenizerPath()
  if (!tokenizerPath) {
    log.error('Tokenizer not found, ML gate disabled')
    return false
  }

  try {
    log.info(`Loading model from: ${modelPath}`)
    ort = require('onnxruntime-node')
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
    })

    const { BertTokenizer } = require('bert-tokenizer')
    tokenizer = new BertTokenizer(tokenizerPath, true, MAX_SEQ_LENGTH)

    log.success('Initialized')
    return true
  } catch (err) {
    log.error('Init failed:', err)
    session = null
    tokenizer = null
    return false
  }
}

/**
 * Unload the question classifier model from memory.
 * Call when meeting stops to free resources. Will reload on next classifyQuestion call.
 */
export async function unloadQuestionClassifier(): Promise<void> {
  if (session) {
    try {
      await (session as { release?: () => Promise<void> }).release?.()
      log.info('Question classifier unloaded')
    } catch {}
    session = null
  }
  tokenizer = null
}

/**
 * Classify text as question (true) or statement (false).
 * Returns null when classifier is unavailable (skip ML gate).
 */
export async function classifyQuestion(text: string): Promise<boolean | null> {
  const ready = await init()
  if (!ready || !session || !tokenizer) return null

  try {
    const { inputIds, segmentIds, inputMask } = tokenizer.convertSingleExample(
      text.slice(0, 400),
    )

    const inputIdsTensor = new ort.Tensor('int64', BigInt64Array.from(inputIds.map((x: number) => BigInt(x))), [
      1,
      inputIds.length,
    ])
    const attentionMaskTensor = new ort.Tensor('int64', BigInt64Array.from(inputMask.map((x: number) => BigInt(x))), [
      1,
      inputMask.length,
    ])
    const tokenTypeIdsTensor = new ort.Tensor(
      'int64',
      BigInt64Array.from(segmentIds.map((x: number) => BigInt(x))),
      [1, segmentIds.length],
    )

    const inputNames = (session as { inputNames?: string[] }).inputNames ?? [
      'input_ids',
      'attention_mask',
      'token_type_ids',
    ]
    const feeds: Record<string, any> = {
      [inputNames[0]]: inputIdsTensor,
      [inputNames[1]]: attentionMaskTensor,
      [inputNames[2]]: tokenTypeIdsTensor,
    }

    const results = await session.run(feeds)
    const outputNames = (session as { outputNames?: string[] }).outputNames
    const outputKey = outputNames?.[0] ?? Object.keys(results)[0]
    const logits = results[outputKey]?.data as Float32Array
    if (!logits || logits.length < 2) return null

    // shahrukhx01/question-vs-statement-classifier: id2label is 0=question, 1=statement (alphabetical)
    const isQuestion = logits[0] > logits[1]
    return isQuestion
  } catch (err) {
    log.warn('Inference failed:', err)
    return true
  }
}
