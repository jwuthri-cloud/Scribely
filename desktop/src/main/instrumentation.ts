/**
 * Langfuse observability instrumentation.
 * Must be imported first so tracing is active before any LLM calls.
 *
 * Set LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL in .env
 * or environment. See .env.example.
 */

import { config } from 'dotenv'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { LangfuseSpanProcessor } from '@langfuse/otel'

// Load .env from desktop/ directory (where npm run dev is executed)
config()

const secretKey = process.env['LANGFUSE_SECRET_KEY']
const publicKey = process.env['LANGFUSE_PUBLIC_KEY']
const baseUrl = process.env['LANGFUSE_BASE_URL'] ?? 'https://cloud.langfuse.com'

let langfuseSpanProcessor: LangfuseSpanProcessor | null = null

if (secretKey && publicKey) {
  langfuseSpanProcessor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl,
    // Immediate export for Electron (short-lived process) to avoid losing traces on exit
    exportMode: 'immediate',
  })

  const sdk = new NodeSDK({
    spanProcessors: [langfuseSpanProcessor],
  })

  sdk.start()
  console.log('[langfuse] Observability enabled')
} else {
  console.log('[langfuse] Skipped — set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY to enable')
}

export async function flushLangfuse(): Promise<void> {
  if (langfuseSpanProcessor) {
    try {
      await langfuseSpanProcessor.forceFlush()
    } catch (err) {
      console.warn('[langfuse] Flush failed:', err)
    }
  }
}
