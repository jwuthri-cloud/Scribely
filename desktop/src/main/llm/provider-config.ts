/**
 * LLM provider abstraction for OpenAI, Ollama, and LM Studio.
 * Both Ollama and LM Studio expose OpenAI-compatible Chat Completions APIs.
 */

import OpenAI from 'openai'
import { observeOpenAI } from '@langfuse/openai'
import { createLogger } from '../logger'

const log = createLogger('provider-config')

export type LLMProvider = 'openai' | 'ollama' | 'lmstudio'

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

/**
 * Create an OpenAI-compatible client for the given provider.
 * For local providers, apiKey is optional (Ollama/LM Studio accept any placeholder).
 * Langfuse tracing is only applied for OpenAI.
 */
export function createLLMClient(
  provider: LLMProvider,
  options: {
    baseUrl?: string
    apiKey?: string | null
    enableLangfuse?: boolean
  } = {},
): OpenAI | null {
  const { baseUrl, apiKey, enableLangfuse = true } = options

  if (provider === 'openai') {
    if (!apiKey?.trim()) return null
    const client = new OpenAI({ apiKey: apiKey.trim() })
    return enableLangfuse ? (observeOpenAI(client) as unknown as OpenAI) : client
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
    log.error(`[provider-config] listLocalModels error:`, msg)
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
