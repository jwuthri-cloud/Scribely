/**
 * OpenAI web search via Responses API.
 * Uses the web_search tool for real-time internet lookups.
 *
 * Query: The search query is the action.payload from the insight:
 *   - For questions: the detected question text (e.g. "Who acquired Windsurf?")
 *   - For key_mention: entity + amount (e.g. "Windsurf $82M")
 *
 * Flow: User clicks "Search the web" -> payload sent as `input` to OpenAI
 * Responses API -> OpenAI runs web search and returns synthesized answer + citations.
 */

import type OpenAI from 'openai'
import type { WebSearchResult } from '../insights/types'

/** Model for web search — gpt-5-nano is well-supported per OpenAI docs */
const WEB_SEARCH_MODEL = 'gpt-4.1-mini'

export interface WebSearchStreamCallbacks {
  onDelta: (delta: string) => void
  onDone: (result: WebSearchResult) => void
  onError: (error: string) => void
}

type UrlCitation = { type?: string; url?: string; title?: string; url_citation?: { url?: string; title?: string } }

function extractSourceFromAnnotation(ann: UrlCitation): { title: string; url: string } | null {
  if (!ann || ann.type !== 'url_citation') return null
  const url = ann.url ?? ann.url_citation?.url
  const title = ann.title ?? ann.url_citation?.title ?? url ?? 'Source'
  if (!url) return null
  return { url, title }
}

function extractSourcesFromOutput(output: unknown): Array<{ title: string; url: string }> {
  const sources: Array<{ title: string; url: string }> = []
  const seenUrls = new Set<string>()
  const items = (output as Array<{ type: string; content?: Array<{ type: string; annotations?: UrlCitation[] }> }>) ?? []
  for (const item of items) {
    if (item.type === 'message' && item.content) {
      for (const block of item.content) {
        if (block.annotations) {
          for (const ann of block.annotations) {
            const src = extractSourceFromAnnotation(ann)
            if (src && !seenUrls.has(src.url)) {
              seenUrls.add(src.url)
              sources.push(src)
            }
          }
        }
      }
    }
  }
  return sources
}

/**
 * Run a web search query using OpenAI's Responses API with web_search tool.
 * Returns content and sources for display in the Live Insights panel.
 */
export async function runWebSearch(
  client: OpenAI,
  query: string,
): Promise<WebSearchResult> {
  try {
    const response = await (client as any).responses.create({
      model: WEB_SEARCH_MODEL,
      input: query,
      tools: [{ type: 'web_search' }],
    })

    const output = response.output as Array<{
      type: string
      content?: Array<{ type: string; text?: string; annotations?: Array<{ type: string; url?: string; title?: string }> }>
    }>

    let content = ''
    const sources = extractSourcesFromOutput(output)

    for (const item of output ?? []) {
      if (item.type === 'message' && item.content) {
        for (const block of item.content) {
          if (block.type === 'output_text' && block.text) {
            content = block.text
          }
        }
      }
    }

    return { content: content.trim() || 'No results found.', sources }
  } catch (err: any) {
    console.error('[web-search] Error:', err)
    return {
      content: '',
      error: err?.message ?? 'Web search failed',
    }
  }
}

/**
 * Extract citations from an output item (message with content).
 * Mirrors the Python approach: item.content[].annotations -> url_citation.
 */
function extractSourcesFromItem(item: { type?: string; content?: Array<{ annotations?: UrlCitation[] }> }): Array<{ title: string; url: string }> {
  const sources: Array<{ title: string; url: string }> = []
  const seenUrls = new Set<string>()
  if (item.type !== 'message' || !item.content) return sources
  for (const block of item.content) {
    if (block.annotations) {
      for (const ann of block.annotations) {
        const src = extractSourceFromAnnotation(ann)
        if (src && !seenUrls.has(src.url)) {
          seenUrls.add(src.url)
          sources.push(src)
        }
      }
    }
  }
  return sources
}

/**
 * Run web search with streaming. Emits text deltas as they arrive,
 * then calls onDone with full content and sources.
 *
 * Sources are collected from (in order of preference):
 * 1. response.output_item.done events — when each message item is done, extract citations from item.content[].annotations (matches Python)
 * 2. response.output_text.annotation.added events (streamed as they arrive)
 * 3. response.completed / response.done event (fallback from full response)
 */
export async function runWebSearchStreaming(
  client: OpenAI,
  query: string,
  callbacks: WebSearchStreamCallbacks,
): Promise<void> {
  try {
    const stream = (client as any).responses.stream({
      model: WEB_SEARCH_MODEL,
      input: query,
      tools: [{ type: 'web_search' }],
    })

    let fullContent = ''
    const sourcesMap = new Map<string, { title: string; url: string }>()
    let finalResponse: { output?: unknown } | null = null

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta' && event.delta) {
        fullContent += event.delta
        callbacks.onDelta(event.delta)
      }
      // Primary: Python uses response.output_item.done — item has full content with annotations
      if (event.type === 'response.output_item.done' && event.item) {
        const item = event.item as { type?: string; content?: Array<{ annotations?: UrlCitation[] }> }
        for (const src of extractSourcesFromItem(item)) {
          if (!sourcesMap.has(src.url)) {
            sourcesMap.set(src.url, src)
          }
        }
      }
      if (event.type === 'response.output_text.annotation.added' && event.annotation) {
        const src = extractSourceFromAnnotation(event.annotation as UrlCitation)
        if (src && !sourcesMap.has(src.url)) {
          sourcesMap.set(src.url, src)
        }
      }
      if ((event.type === 'response.completed' || event.type === 'response.done') && event.response) {
        finalResponse = event.response
      }
    }

    // Prefer annotation.added / output_item.done sources; fallback to final response output
    let sources = Array.from(sourcesMap.values())
    if (sources.length === 0 && finalResponse?.output) {
      sources = extractSourcesFromOutput(finalResponse.output)
    }
    const content = fullContent.trim() || 'No results found.'
    callbacks.onDone({ content, sources })
  } catch (err: any) {
    console.error('[web-search] Streaming error:', err)
    callbacks.onError(err?.message ?? 'Web search failed')
  }
}
