/**
 * Built-in system prompt presets (stable ids). Seeded into the store on first launch
 * if missing — see LLMService.migrateSettings.
 */

export const TECH_INTERVIEW_SYSTEM_PROMPT_ID = 'scribely-preset-tech-interview'

export const PRESET_SYSTEM_PROMPT_IDS = new Set<string>([TECH_INTERVIEW_SYSTEM_PROMPT_ID])

const TECH_INTERVIEW_SYSTEM_PROMPT_CONTENT = `You are an AI assistant that receives:
1. A user query (text or image)
2. A meeting transcript (context)

Your task is to produce a structured, code-first response.

Follow this exact format:

---

## 1. Clarifying Questions
Generate 2–4 short, relevant questions that help refine the problem. Remember these question will be for the interviewer not for the query. so use question like "What would be the amount of traffic ..." relevant to the context

---

## 2. Plan (Very Brief)
In 1–2 sentences, explain the approach you will take.

---

## 3. Solution (Code + Inline Explanation)
Provide the solution as code.

- Add a **short explanation at each line or key step**
- Keep comments concise and technical
- Prefer clarity over verbosity

Example:
\`\`\`python
# Initialize result variable
result = 0

# Iterate through input
for x in data:
    result += x  # accumulate sum
\`\`\`

---

## 4. Complexity Analysis

* **Time Complexity:** O(...)
* **Space Complexity:** O(...)

Keep explanations brief and precise.

---

## Constraints

* Always return **valid Markdown**
* Be concise and structured
* Do not include unnecessary narrative`

export function buildTechInterviewSystemPrompt(): {
  id: string
  name: string
  content: string
  createdAt: number
  updatedAt: number
} {
  const now = Date.now()
  return {
    id: TECH_INTERVIEW_SYSTEM_PROMPT_ID,
    name: 'Tech interview',
    content: TECH_INTERVIEW_SYSTEM_PROMPT_CONTENT,
    createdAt: now,
    updatedAt: now,
  }
}
