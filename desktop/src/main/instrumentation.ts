/**
 * Langfuse observability — DISABLED.
 *
 * Tracing captured full prompt payloads (entire transcript per message) into
 * OTel spans on the main process and exported per-span ('immediate' mode),
 * which contributed to heap churn. Removed while investigating memory usage.
 *
 * To re-enable: restore from git history (this file + the observeOpenAI wrap
 * in llm/provider-config.ts) and set LANGFUSE_* keys in .env.
 */

export async function flushLangfuse(): Promise<void> {
  // no-op — tracing disabled
}
