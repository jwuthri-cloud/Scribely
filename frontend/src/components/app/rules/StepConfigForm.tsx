"use client"

import type { RuleStepType } from "@/lib/api"

export type StepDraft = {
  /** Stable id for React Flow / API round-trip */
  id?: string
  order_index: number
  name: string
  step_type: RuleStepType
  config: Record<string, unknown>
}

const STEP_TYPES: { value: RuleStepType; label: string }[] = [
  { value: "llm_prompt", label: "LLM prompt" },
  { value: "send_email", label: "Send email (Resend)" },
  { value: "push_notification", label: "Web push" },
  { value: "webhook", label: "Webhook" },
  { value: "composio_action", label: "Composio action" },
]

function defaultConfig(t: RuleStepType): Record<string, unknown> {
  switch (t) {
    case "llm_prompt":
      return {
        model: "openai/gpt-5.4-mini",
        system_prompt: "You are a helpful assistant summarizing meeting content.",
        user_prompt_template:
          "Summarize the following transcript in 5 bullet points:\n\n{{ meeting.transcript }}",
        temperature: 0.2,
      }
    case "send_email":
      return {
        to_template: "{{ meeting.title }}@example.com",
        subject_template: "Meeting: {{ meeting.title }}",
        body_template: "<p>{{ meeting.summary }}</p>",
        body_is_html: true,
      }
    case "push_notification":
      return {
        title_template: "Meeting done",
        body_template: "{{ meeting.title }}",
      }
    case "webhook":
      return {
        url: "https://example.com/hook",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body_template: '{"meeting_id": "{{ meeting.id }}", "title": "{{ meeting.title }}"}',
      }
    case "composio_action":
      return {
        slug: "GMAIL_SEND_EMAIL",
        arguments: {
          recipient_email: "user@example.com",
          subject: "{{ meeting.title }}",
          body: "{{ meeting.transcript }}",
        },
      }
    default:
      return {}
  }
}

export function StepConfigForm({
  step,
  onChange,
}: {
  step: StepDraft
  onChange: (s: StepDraft) => void
}) {
  const setType = (step_type: RuleStepType) => {
    onChange({
      ...step,
      step_type,
      config: { ...defaultConfig(step_type), ...step.config },
    })
  }

  const setConfigJson = (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      onChange({ ...step, config: parsed })
    } catch {
      /* keep typing */
    }
  }

  const configStr = JSON.stringify(step.config, null, 2)

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-white/50">Step type</label>
        <select
          value={step.step_type}
          onChange={(e) => setType(e.target.value as RuleStepType)}
          className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white"
        >
          {STEP_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-white/50">Step name</label>
        <input
          value={step.name}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30"
          placeholder="e.g. Summarize transcript"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-white/50">
          Config (JSON) — use Jinja: {"{{ meeting.transcript }}"}, {"{{ steps[0].result }}"}
        </label>
        <textarea
          value={configStr}
          onChange={(e) => setConfigJson(e.target.value)}
          rows={14}
          spellCheck={false}
          className="w-full resize-y rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 font-mono text-xs text-emerald-100/90"
        />
      </div>
    </div>
  )
}

export function newStepDraft(index: number): StepDraft {
  const id =
    typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : undefined
  return {
    id,
    order_index: index,
    name: `Step ${index + 1}`,
    step_type: "llm_prompt",
    config: defaultConfig("llm_prompt"),
  }
}
