/**
 * LLM provider abstraction for OpenAI, Ollama, and LM Studio.
 * Both Ollama and LM Studio expose OpenAI-compatible Chat Completions APIs.
 */

import OpenAI from 'openai'
import { createLogger } from '../logger'

const log = createLogger('provider-config')

export type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'lmstudio'

export interface LocalModelInfo {
  id: string
  name: string
  contextWindow: number
  maxResponseTokens: number
}

export const PROVIDER_DEFAULTS: Record<LLMProvider, { baseUrl: string; apiKeyRequired: boolean }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKeyRequired: true,
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    apiKeyRequired: true,
  },
  // Gemini speaks the OpenAI Chat Completions protocol at this endpoint —
  // no separate SDK needed, unlike Anthropic.
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyRequired: true,
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    apiKeyRequired: false,
  },
  lmstudio: {
    baseUrl: 'http://localhost:1234/v1',
    apiKeyRequired: false,
  },
}

/** Default context window for local models when not specified by API */
export const DEFAULT_LOCAL_CONTEXT_WINDOW = 8192

/** Default max response tokens for local models */
export const DEFAULT_LOCAL_MAX_RESPONSE_TOKENS = 4096

/** True when the local Ollama/LM Studio server is simply not reachable (expected if not installed / not running). */
function isBenignLocalUnreachable(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  let e: unknown = err
  for (let depth = 0; depth < 8 && e && typeof e === 'object'; depth++) {
    const o = e as NodeJS.ErrnoException
    const code = o.code
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT') return true
    if (typeof o.message === 'string' && /ECONNREFUSED|ENOTFOUND/i.test(o.message)) return true
    e = (o as { cause?: unknown }).cause
  }
  // Undici: TypeError with message "fetch failed" when nothing listens on localhost
  if (err.message === 'fetch failed') return true
  return false
}

/**
 * Create an OpenAI-compatible client for the given provider.
 * For local providers, apiKey is optional (Ollama/LM Studio accept any placeholder).
 */
export function createLLMClient(
  provider: LLMProvider,
  options: {
    baseUrl?: string
    apiKey?: string | null
  } = {},
): OpenAI | null {
  const { baseUrl, apiKey } = options

  // Anthropic does not speak the OpenAI protocol — llm-service routes Claude
  // requests through anthropic-chat.ts with its own SDK client.
  if (provider === 'anthropic') return null

  if (provider === 'openai' || provider === 'gemini') {
    if (!apiKey?.trim()) return null
    const client = new OpenAI({
      apiKey: apiKey.trim(),
      ...(provider === 'gemini' && { baseURL: PROVIDER_DEFAULTS.gemini.baseUrl }),
    })
    return client
  }

  // Local providers: Ollama and LM Studio
  const defaults = PROVIDER_DEFAULTS[provider]
  const url = (baseUrl?.trim() || defaults.baseUrl).replace(/\/$/, '')
  // Ensure /v1 suffix for OpenAI-compatible endpoint
  const finalUrl = url.endsWith('/v1') ? url : `${url}/v1`

  const client = new OpenAI({
    baseURL: finalUrl,
    apiKey: 'ollama', // Required by SDK but unused by Ollama/LM Studio
  })
  return client
}

/**
 * Fetch available models from Ollama.
 * GET http://localhost:11434/api/tags
 */
export async function fetchOllamaModels(baseUrl: string): Promise<LocalModelInfo[]> {
  const url = baseUrl.replace(/\/v1\/?$/, '')
  const res = await fetch(`${url}/api/tags`)
  if (!res.ok) throw new Error(`Ollama API error: ${res.status}`)
  const data = (await res.json()) as { models?: Array<{ name: string; details?: { parameter_size?: string } }> }
  const models = data.models ?? []
  return models.map((m) => ({
    id: m.name,
    name: m.name,
    contextWindow: DEFAULT_LOCAL_CONTEXT_WINDOW,
    maxResponseTokens: DEFAULT_LOCAL_MAX_RESPONSE_TOKENS,
  }))
}

/**
 * Fetch available models from LM Studio (OpenAI-compatible /v1/models).
 */
export async function fetchLMStudioModels(baseUrl: string): Promise<LocalModelInfo[]> {
  const url = baseUrl.replace(/\/$/, '')
  const finalUrl = url.endsWith('/v1') ? url : `${url}/v1`
  const res = await fetch(`${finalUrl}/models`)
  if (!res.ok) throw new Error(`LM Studio API error: ${res.status}`)
  const data = (await res.json()) as {
    data?: Array<{
      id: string
      object?: string
      owned_by?: string
      max_context_length?: number
    }>
  }
  const models = data.data ?? []
  return models.map((m) => ({
    id: m.id,
    name: m.id,
    contextWindow: m.max_context_length ?? DEFAULT_LOCAL_CONTEXT_WINDOW,
    maxResponseTokens: Math.min(
      m.max_context_length ?? DEFAULT_LOCAL_CONTEXT_WINDOW,
      DEFAULT_LOCAL_MAX_RESPONSE_TOKENS,
    ),
  }))
}

/**
 * List local models for the given provider.
 */
export async function listLocalModels(
  provider: 'ollama' | 'lmstudio',
  baseUrl?: string,
): Promise<{ models: LocalModelInfo[]; error?: string }> {
  const defaults = PROVIDER_DEFAULTS[provider]
  const url = baseUrl?.trim() || defaults.baseUrl

  try {
    const models =
      provider === 'ollama' ? await fetchOllamaModels(url) : await fetchLMStudioModels(url)
    return { models }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch models'
    // Wizard probes both local providers; "not running" is normal — do not log at error
    if (!isBenignLocalUnreachable(err)) {
      log.error(`[provider-config] listLocalModels error:`, msg)
    }
    return { models: [], error: msg }
  }
}

/**
 * Test connection to local LLM server.
 */
export async function testLocalConnection(
  provider: 'ollama' | 'lmstudio',
  baseUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await listLocalModels(provider, baseUrl)
  return {
    ok: !result.error,
    error: result.error,
  }
}

/** Result of probing a single local provider */
export interface LocalProviderProbeResult {
  ok: boolean
  models: LocalModelInfo[]
  error?: string
}

/**
 * Probe both Ollama and LM Studio to see if they're running and which models are available.
 * Uses default URLs. Runs both probes in parallel.
 */
export async function probeLocalProviders(): Promise<{
  ollama: LocalProviderProbeResult
  lmstudio: LocalProviderProbeResult
}> {
  const [ollama, lmstudio] = await Promise.all([
    listLocalModels('ollama', PROVIDER_DEFAULTS.ollama.baseUrl).then((r) => ({
      ok: !r.error,
      models: r.models,
      error: r.error,
    })),
    listLocalModels('lmstudio', PROVIDER_DEFAULTS.lmstudio.baseUrl).then((r) => ({
      ok: !r.error,
      models: r.models,
      error: r.error,
    })),
  ])
  return { ollama, lmstudio }
}
