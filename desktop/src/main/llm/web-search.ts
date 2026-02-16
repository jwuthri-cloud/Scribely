/**
 * OpenAI web search via Responses API.
 * Uses the web_search tool for real-time internet lookups.
 */

import type OpenAI from 'openai'
import type { WebSearchResult } from '../insights/types'

/** Model for web search — gpt-4o-mini is well-supported per OpenAI docs */
const WEB_SEARCH_MODEL = 'gpt-4o-mini'

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
    const sources: Array<{ title: string; url: string }> = []
    const seenUrls = new Set<string>()

    for (const item of output ?? []) {
      if (item.type === 'message' && item.content) {
        for (const block of item.content) {
          if (block.type === 'output_text' && block.text) {
            content = block.text
          }
          if (block.annotations) {
            for (const ann of block.annotations) {
              if (ann.type === 'url_citation' && ann.url && ann.title && !seenUrls.has(ann.url)) {
                seenUrls.add(ann.url)
                sources.push({ title: ann.title, url: ann.url })
              }
            }
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
