/**
 * Default phrase lists for Live Insights heuristic detection.
 * Used by main (heuristic-detector) and renderer (InsightsView settings).
 */

export type TranscriptionLanguage = 'en' | 'multi'

// ── English ────────────────────────────────────────────────────────────────

const EN_QUESTION_WORDS = [
  'who',
  'what',
  'when',
  'where',
  'why',
  'how',
  'which',
  'whose',
  'whom',
  'tell me',
  'explain',
  'clarify',
  'describe',
  'show me',
  'give me',
  'walk me through',
] as const

const EN_QUESTION_VERBS = [
  'can',
  'could',
  'would',
  'should',
  'do',
  'does',
  'did',
  'is',
  'are',
  'was',
  'were',
  'has',
  'have',
  'had',
  'will',
  'shall',
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "doesn't",
  "didn't",
  "haven't",
  "hasn't",
  "won't",
  "wouldn't",
  "couldn't",
  "shouldn't",
] as const

const EN_DECISION_KEYWORDS = [
  'agreed',
  "we've agreed",
  "we agreed",
  "i've agreed",
  "i agreed",
  "let's go with",
  "lets go with",
  'we decided',
  "we've decided",
  "i've decided",
  "i decided",
  'decision:',
  'decided to',
  'so we are going with',
  'sounds good',
  'that works',
  'approved',
  'approved it',
] as const

// ── French ─────────────────────────────────────────────────────────────────

const FR_QUESTION_WORDS = [
  'qui',
  'quoi',
  'quand',
  'où',
  'pourquoi',
  'comment',
  'quel',
  'quelle',
  'quels',
  'quelles',
  'combien',
  'est-ce que',
  "qu'est-ce que",
  "qu'est-ce qui",
  'lequel',
  'laquelle',
  'explique',
  'décris',
  'montre-moi',
  'dis-moi',
] as const

const FR_QUESTION_VERBS = [
  'peut',
  'peuvent',
  'pourrait',
  'pourraient',
  'serait',
  'seraient',
  'est',
  'sont',
  'était',
  'étaient',
  // 'a',
  'ont',
  'avait',
  'avaient',
  'faut',
  'doit',
  'doivent',
] as const

const FR_DECISION_KEYWORDS = [
  "d'accord",
  "on est d'accord",
  "nous sommes d'accord",
  "j'ai accepté",
  "on a décidé",
  "nous avons décidé",
  "j'ai décidé",
  "c'est décidé",
  "parfait",
  "ça marche",
  "ça va",
  "approuvé",
  "validé",
] as const

// ── Spanish ────────────────────────────────────────────────────────────────

const ES_QUESTION_WORDS = [
  'quién',
  'quiénes',
  'qué',
  'cuándo',
  'dónde',
  'por qué',
  'cómo',
  'cuál',
  'cuáles',
  'cuánto',
  'cuánta',
  'cuántos',
  'cuántas',
  'explica',
  'describe',
  'muéstrame',
  'dime',
] as const

const ES_QUESTION_VERBS = [
  'puede',
  'pueden',
  'podría',
  'podrían',
  'sería',
  'serían',
  'es',
  'son',
  'era',
  'eran',
  'tiene',
  'tienen',
  'tenía',
  'tenían',
  'debe',
  'deben',
] as const

const ES_DECISION_KEYWORDS = [
  'de acuerdo',
  'estamos de acuerdo',
  'hemos acordado',
  'decidimos',
  'hemos decidido',
  'he decidido',
  'vamos con',
  'vamos a ir con',
  'suena bien',
  'eso funciona',
  'aprobado',
  'aprobada',
] as const

// ── German ─────────────────────────────────────────────────────────────────

const DE_QUESTION_WORDS = [
  'wer',
  'was',
  'wann',
  'wo',
  'warum',
  'wie',
  'welcher',
  'welche',
  'welches',
  'welche',
  'wie viel',
  'wie viele',
  'erkläre',
  'beschreibe',
  'zeig mir',
  'sag mir',
] as const

const DE_QUESTION_VERBS = [
  'kann',
  'können',
  'könnte',
  'könnten',
  'wäre',
  'wären',
  'ist',
  'sind',
  'war',
  'waren',
  'hat',
  'haben',
  'hatte',
  'hatten',
  'muss',
  'müssen',
] as const

const DE_DECISION_KEYWORDS = [
  'einverstanden',
  'wir sind einverstanden',
  'wir haben zugestimmt',
  'ich habe zugestimmt',
  'wir haben entschieden',
  'ich habe entschieden',
  'entschieden',
  'klingt gut',
  'das passt',
  'genehmigt',
  'freigegeben',
] as const

// ── Chinese ────────────────────────────────────────────────────────────────

const ZH_QUESTION_WORDS = [
  '谁',
  '什么',
  '什么时候',
  '何时',
  '哪里',
  '哪儿',
  '为什么',
  '怎么',
  '怎样',
  '哪个',
  '哪些',
  '多少',
  '几',
  '解释',
  '描述',
  '告诉我',
  '给我看',
] as const

const ZH_QUESTION_VERBS = [
  '能',
  '可以',
  '会',
  '是',
  '有',
  '有没有',
  '会不会',
  '能不能',
] as const

const ZH_DECISION_KEYWORDS = [
  '同意',
  '我们同意',
  '决定了',
  '我们决定了',
  '我决定了',
  '好的',
  '可以',
  '通过',
  '批准',
] as const

// ── Vietnamese ─────────────────────────────────────────────────────────────

const VI_QUESTION_WORDS = [
  'ai',
  'gì',
  'khi nào',
  'ở đâu',
  'tại sao',
  'vì sao',
  'như thế nào',
  'thế nào',
  'cái gì',
  'cái nào',
  'bao nhiêu',
  'giải thích',
  'mô tả',
  'cho tôi xem',
  'cho tôi biết',
] as const

const VI_QUESTION_VERBS = [
  'có thể',
  'có',
  'là',
  'được',
  'có phải',
  'phải',
  'cần',
] as const

const VI_DECISION_KEYWORDS = [
  'đồng ý',
  'chúng ta đồng ý',
  'tôi đồng ý',
  'đã quyết định',
  'chúng ta đã quyết định',
  'được rồi',
  'ổn',
  'phê duyệt',
] as const

// ── By-language maps ───────────────────────────────────────────────────────

export const QUESTION_WORDS_BY_LANG: Record<string, readonly string[]> = {
  en: EN_QUESTION_WORDS,
  fr: FR_QUESTION_WORDS,
  es: ES_QUESTION_WORDS,
  de: DE_QUESTION_WORDS,
  zh: ZH_QUESTION_WORDS,
  vi: VI_QUESTION_WORDS,
}

export const QUESTION_VERBS_BY_LANG: Record<string, readonly string[]> = {
  en: EN_QUESTION_VERBS,
  fr: FR_QUESTION_VERBS,
  es: ES_QUESTION_VERBS,
  de: DE_QUESTION_VERBS,
  zh: ZH_QUESTION_VERBS,
  vi: VI_QUESTION_VERBS,
}

export const DECISION_KEYWORDS_BY_LANG: Record<string, readonly string[]> = {
  en: EN_DECISION_KEYWORDS,
  fr: FR_DECISION_KEYWORDS,
  es: ES_DECISION_KEYWORDS,
  de: DE_DECISION_KEYWORDS,
  zh: ZH_DECISION_KEYWORDS,
  vi: VI_DECISION_KEYWORDS,
}

const SUPPORTED_LANGS = ['en', 'fr', 'es', 'de', 'zh', 'vi'] as const

export interface KeywordsForLanguage {
  questionWords: string[]
  questionVerbs: string[]
  decisionKeywords: string[]
}

/**
 * Get heuristic keywords for the given transcription language.
 * - lang === 'en' → English only
 * - lang === 'multi' → all 6 languages merged (deduplicated)
 */
export function getKeywordsForLanguage(lang: TranscriptionLanguage): KeywordsForLanguage {
  if (lang === 'en') {
    return {
      questionWords: [...EN_QUESTION_WORDS],
      questionVerbs: [...EN_QUESTION_VERBS],
      decisionKeywords: [...EN_DECISION_KEYWORDS],
    }
  }
  const questionWords = [...new Set(SUPPORTED_LANGS.flatMap((l) => QUESTION_WORDS_BY_LANG[l] ?? []))]
  const questionVerbs = [...new Set(SUPPORTED_LANGS.flatMap((l) => QUESTION_VERBS_BY_LANG[l] ?? []))]
  const decisionKeywords = [...new Set(SUPPORTED_LANGS.flatMap((l) => DECISION_KEYWORDS_BY_LANG[l] ?? []))]
  return { questionWords, questionVerbs, decisionKeywords }
}

/**
 * Get all built-in keywords for display in the settings UI.
 * When lang === 'multi', returns grouped by language.
 */
export function getAllBuiltInKeywords(lang: TranscriptionLanguage): {
  words: string[]
  verbs: string[]
  byLang?: Record<string, { words: string[]; verbs: string[] }>
} {
  if (lang === 'en') {
    return {
      words: [...EN_QUESTION_WORDS],
      verbs: [...EN_QUESTION_VERBS],
    }
  }
  const byLang: Record<string, { words: string[]; verbs: string[] }> = {}
  for (const l of SUPPORTED_LANGS) {
    byLang[l] = {
      words: [...(QUESTION_WORDS_BY_LANG[l] ?? [])],
      verbs: [...(QUESTION_VERBS_BY_LANG[l] ?? [])],
    }
  }
  const words = [...new Set(SUPPORTED_LANGS.flatMap((l) => QUESTION_WORDS_BY_LANG[l] ?? []))]
  const verbs = [...new Set(SUPPORTED_LANGS.flatMap((l) => QUESTION_VERBS_BY_LANG[l] ?? []))]
  return { words, verbs, byLang }
}

// ── Backward compatibility ─────────────────────────────────────────────────

export const DEFAULT_QUESTION_WORDS = EN_QUESTION_WORDS
export const DEFAULT_QUESTION_VERBS = EN_QUESTION_VERBS
export const DEFAULT_DECISION_KEYWORDS = EN_DECISION_KEYWORDS
