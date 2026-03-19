/**
 * Legacy OpenAI model ids (desktop app) → current API model ids.
 * Migrates electron-store `llm.defaultModel` and similar persisted values.
 */
export const LEGACY_OPENAI_MODEL_ID_MAP: Record<string, string> = {
  'gpt-5.4-nano': 'gpt-5-nano',
  'gpt-5.4-mini': 'gpt-5-mini',
  'gpt-5.4': 'gpt-5.2',
}

export function migrateLegacyOpenAIModelId(modelId: string): string {
  return LEGACY_OPENAI_MODEL_ID_MAP[modelId] ?? modelId
}
