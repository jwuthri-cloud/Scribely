export interface DemoTranscriptEntry {
  id: string
  speaker: "You" | "Them"
  text: string
  timestamp: string
}

export interface DemoChatMessage {
  role: "user" | "assistant"
  content: string
}

export const DEMO_TRANSCRIPT_ENTRIES: DemoTranscriptEntry[] = [
  {
    id: "t1",
    speaker: "Them",
    text: "So the quarterly numbers are looking really strong. Revenue is up 23% compared to last quarter.",
    timestamp: "1:30",
  },
  {
    id: "t2",
    speaker: "You",
    text: "That's great. What about the Q3 forecast? Are we still on track for the 15% growth target?",
    timestamp: "1:32",
  },
  {
    id: "t3",
    speaker: "Them",
    text: "We're actually projecting 18% growth now. The new enterprise deals are closing faster than expected.",
    timestamp: "1:34",
  },
  {
    id: "t4",
    speaker: "You",
    text: "Perfect. And the product launch timeline — are we still looking at September 15th?",
    timestamp: "1:36",
  },
  {
    id: "t5",
    speaker: "Them",
    text: "Yes, September 15th is confirmed. The engineering team has already completed the beta phase.",
    timestamp: "1:38",
  },
]

export const DEMO_AUTO_QUESTION = "What deadlines were mentioned?"

export const DEMO_AUTO_RESPONSE =
  "Based on the meeting transcript, here are the key deadlines and targets mentioned:\n\n" +
  "**Deadlines:**\n" +
  "- **September 15th** — Product launch date (confirmed, beta phase complete)\n\n" +
  "**Targets:**\n" +
  "- **Q3 growth target**: Originally 15%, now projected at **18%** due to faster enterprise deal closures\n" +
  "- **Revenue**: Up **23%** compared to last quarter\n\n" +
  "The team appears to be ahead of schedule on both revenue and product delivery."

export const DEMO_CANNED_RESPONSES: Record<string, string> = {
  "List action items":
    "Here are the action items from the meeting so far:\n\n" +
    "1. **Track Q3 growth** against the revised 18% projection\n" +
    "2. **Prepare for September 15th launch** — ensure all teams are aligned\n" +
    "3. **Follow up on enterprise deals** — monitor close rates\n" +
    "4. **Review quarterly revenue report** — document the 23% increase",
  Explain:
    "This is a quarterly business review meeting. The participants are discussing:\n\n" +
    "- **Financial performance**: Revenue increased 23% quarter-over-quarter\n" +
    "- **Growth projections**: Q3 forecast upgraded from 15% to 18%\n" +
    "- **Product timeline**: A product launch is confirmed for September 15th",
  default:
    "Based on the meeting so far, the key discussion points include quarterly revenue growth of 23%, " +
    "an upgraded Q3 growth forecast of 18%, and a confirmed product launch date of September 15th. " +
    "The team appears to be performing ahead of expectations across all metrics.",
}

export const DEMO_QUICK_ACTIONS = [
  { label: "List action items", icon: "list" },
  { label: "Explain", icon: "explain" },
  { label: "Fix code", icon: "code" },
  { label: "Rewrite", icon: "edit" },
]
