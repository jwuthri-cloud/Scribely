import type { Edge, Node } from "@xyflow/react"
import type { RuleTrigger } from "@/lib/api"
import { defaultConfig } from "@/components/app/rules/StepConfigForm"
import { RULE_TRIGGER_NODE_ID } from "@/components/app/rules/flow/constants"
import {
  TRIGGER_LABEL,
  type RuleStepNodeData,
  type TriggerNodeData,
} from "@/components/app/rules/flow/rule-flow-utils"

function newStepId(): string {
  return typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function triggerNode(trigger: RuleTrigger): Node {
  return {
    id: RULE_TRIGGER_NODE_ID,
    type: "trigger",
    position: { x: 80, y: 140 },
    deletable: false,
    data: {
      trigger,
      label: TRIGGER_LABEL[trigger],
    } satisfies TriggerNodeData,
  }
}

export type RuleTemplate = {
  id: string
  title: string
  blurb: string
  suggestedName: string
  suggestedDescription: string
  buildFlow: () => { nodes: Node[]; edges: Edge[] }
}

/** Before meeting: web push reminder (works without email setup). */
function buildBeforeReminder(): { nodes: Node[]; edges: Edge[] } {
  const stepId = newStepId()
  const cfg = defaultConfig("push_notification")
  const config = {
    ...cfg,
    title_template: "Reminder: {{ meeting.title }}",
    body_template: "Your meeting is coming up. Join on time — good luck!",
  }
  return {
    nodes: [
      triggerNode("before_meeting"),
      {
        id: stepId,
        type: "ruleStep",
        position: { x: 420, y: 120 },
        data: {
          name: "Send reminder",
          step_type: "push_notification",
          config,
        } satisfies RuleStepNodeData,
      },
    ],
    edges: [
      {
        id: `e-${RULE_TRIGGER_NODE_ID}-${stepId}`,
        source: RULE_TRIGGER_NODE_ID,
        target: stepId,
      },
    ],
  }
}

/** During meeting: lightweight LLM “live note” placeholder users can edit. */
function buildDuringLive(): { nodes: Node[]; edges: Edge[] } {
  const stepId = newStepId()
  const cfg = defaultConfig("llm_prompt")
  const config = {
    ...cfg,
    system_prompt:
      "You help during live meetings. Reply with 2–3 short bullet points only.",
    user_prompt_template:
      "Meeting title: {{ meeting.title }}\n\nLatest transcript chunk:\n{{ meeting.transcript }}\n\nGive quick live takeaways.",
  }
  return {
    nodes: [
      triggerNode("during_meeting"),
      {
        id: stepId,
        type: "ruleStep",
        position: { x: 420, y: 120 },
        data: {
          name: "Live takeaways",
          step_type: "llm_prompt",
          config,
        } satisfies RuleStepNodeData,
      },
    ],
    edges: [
      {
        id: `e-${RULE_TRIGGER_NODE_ID}-${stepId}`,
        source: RULE_TRIGGER_NODE_ID,
        target: stepId,
      },
    ],
  }
}

/** After meeting: summarize then email (two steps, wired). */
function buildAfterSummaryEmail(): { nodes: Node[]; edges: Edge[] } {
  const llmId = newStepId()
  const emailId = newStepId()
  const llmCfg = {
    ...defaultConfig("llm_prompt"),
    user_prompt_template:
      "Produce a concise HTML summary (use <p> and <ul>) for this meeting:\n\n{{ meeting.transcript }}",
    output_schema: [{ name: "result", type: "string", description: "HTML summary" }],
  }
  const emailCfg = {
    ...defaultConfig("send_email"),
    to_template: "you@example.com",
    subject_template: "Summary: {{ meeting.title }}",
    body_template: "<div>{{ steps[0].result }}</div>",
    body_is_html: true,
  }
  return {
    nodes: [
      triggerNode("after_meeting"),
      {
        id: llmId,
        type: "ruleStep",
        position: { x: 380, y: 100 },
        data: {
          name: "Summarize meeting",
          step_type: "llm_prompt",
          config: llmCfg,
        } satisfies RuleStepNodeData,
      },
      {
        id: emailId,
        type: "ruleStep",
        position: { x: 680, y: 100 },
        data: {
          name: "Email summary",
          step_type: "send_email",
          config: emailCfg,
        } satisfies RuleStepNodeData,
      },
    ],
    edges: [
      {
        id: `e-${RULE_TRIGGER_NODE_ID}-${llmId}`,
        source: RULE_TRIGGER_NODE_ID,
        target: llmId,
      },
      {
        id: `e-${llmId}-${emailId}`,
        source: llmId,
        target: emailId,
      },
    ],
  }
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: "before-reminder",
    title: "Before meeting",
    blurb: "Push a reminder before the meeting starts.",
    suggestedName: "Meeting reminder",
    suggestedDescription: "Notifies you before a scheduled meeting.",
    buildFlow: buildBeforeReminder,
  },
  {
    id: "during-live",
    title: "During meeting",
    blurb: "LLM live takeaways from the latest transcript chunk.",
    suggestedName: "Live takeaways",
    suggestedDescription: "Short bullets while the meeting is running.",
    buildFlow: buildDuringLive,
  },
  {
    id: "after-summary-email",
    title: "After meeting",
    blurb: "Summarize the transcript, then email HTML to you.",
    suggestedName: "Summary email",
    suggestedDescription: "Post-meeting summary delivered by email.",
    buildFlow: buildAfterSummaryEmail,
  },
]
