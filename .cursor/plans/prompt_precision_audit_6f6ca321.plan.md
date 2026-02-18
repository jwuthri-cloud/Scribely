---
name: Prompt Precision Audit
overview: Audit and tighten all 4 LLM prompts in llm-service.ts to maximize precision (favor null over garbage), eliminate useless outputs, and ensure every insight shown to the user is high-quality and actionable in real time.
todos:
  - id: validate-insights-prompt-v2
    content: "Rewrite validateInsights prompt: reframe as rejection-first, add hard rules for key_mention (3+ words), action_item (needs owner/verb), decision (needs concrete choice), topic (default N/A)"
    status: completed
  - id: validate-question-prompt-v2
    content: "Rewrite validateQuestion prompt: add explicit rejection list (rhetorical, tag questions, filler), strengthen question_with_context rules"
    status: completed
  - id: enrich-prompt-v2
    content: "Rewrite enrichForInsight prompt: description = verbatim text for questions, better search payloads, allow null response for trivial events"
    status: completed
  - id: code-level-guard
    content: Add code-level guard in validateInsights return parsing to reject key_mention under 3 words
    status: completed
isProject: false
---

# Prompt Precision Audit

There are **4 prompts** inside [llm-service.ts](desktop/src/main/llm/llm-service.ts) that need tightening. The chat system prompt and summarizer prompt are already solid and out of scope.

## Prompt 1: `validateInsights` (line 798) -- Non-question insight validation

**Current problems:**

- `key_mention` still returns bare names, numbers, and generic phrases despite instructions not to. The model ignores "if in doubt, return null" because the prompt still asks it to *extract* key_mention as a triggered modality -- the model feels obligated to return something.
- `action_item` and `decision` lack a precision bar -- no examples of what to reject.
- `topic` has no minimum bar -- could fire on trivial shifts.
- The prompt says "for each modality that was triggered, output the extracted value or null" -- this framing biases the model toward extraction rather than rejection.

**Changes:**

- Reframe the prompt opening: the model's job is to **reject noise**, not to extract everything. Explicitly say "most utterances should produce all nulls."
- `key_mention`: add a hard rule -- must be 3+ words AND useful as a search query. Single words/names/numbers = always null.
- `action_item`: add rejection examples -- "we should think about it", "maybe we could" are NOT action items. Must have a clear owner or verb.
- `decision`: add rejection examples -- "let's see", "sounds good" are NOT decisions. Must state a concrete choice.
- `topic`: require the new topic to be clearly different from what came before; "N/A" should be the default.
- `entities`: keep as-is (low risk, not user-facing).

## Prompt 2: `validateQuestion` (line 901) -- Question validation

**Current problems:**

- Fires on rhetorical questions, self-directed questions from "You" (the user), and conversational filler ("you know what I mean?", "right?").
- `question_with_context` sometimes adds useless parenthetical explanations despite instructions.
- No explicit rejection criteria for non-genuine questions.

**Changes:**

- Add explicit rejection list: rhetorical questions ("you know?", "right?", "isn't it?"), tag questions, self-answered questions, and filler.
- Strengthen: if the question wouldn't benefit from an AI answer or web search, return "na".
- `question_with_context`: if the context doesn't meaningfully change the question, return the exact same string as `question` (not a rewrite with added fluff).

## Prompt 3: `enrichForInsight` (line 954) -- Insight enrichment

**Current problems:**

- `description` sometimes adds meta-commentary ("In the meeting, asking about...").
- `suggestedActions` payloads are generic -- the search payload should be the contextual question, not the raw text.
- The prompt doesn't know about `questionWithContext` -- it only gets `event.text` (the raw question).

**Changes:**

- For questions: `description` = the question text verbatim. No rewording, no explanation.
- For non-questions: `description` = one short sentence about what happened, no filler.
- `suggestedActions` search payload: tell the model to write a good web search query, not just echo the text.
- Add: "If the event text is too vague or trivial to enrich meaningfully, respond with null."

## Prompt 4: `DEFAULT_SYSTEM_PROMPT` (line 130) -- Chat system prompt

This prompt is already well-tuned for real-time use. **No changes needed.**

## Out of scope

- `DEFAULT_SUMMARIZER_SYSTEM_PROMPT` in [summarizer-defaults.ts](desktop/src/shared/summarizer-defaults.ts) -- not user-facing in real time, already structured.
- Web search in [web-search.ts](desktop/src/main/llm/web-search.ts) -- uses Responses API with `web_search` tool, no custom prompt.

## Post-prompt hardening (code-level)

In addition to prompt changes, add a code-level safety net in `validateInsights` return parsing (line 865-871) to reject `key_mention` values that are too short (under 3 words) -- this catches cases where the model ignores the prompt.