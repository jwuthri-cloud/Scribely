LLM Integration Architecture — AssistMe Desktop
Context
AssistMe is an Electron overlay app that captures meeting audio, transcribes it locally via Whisper, and is invisible to screen sharing. The chat system is currently a placeholder (send-message IPC returns a hardcoded string). We need to integrate OpenAI models (gpt5-nano, gpt5-mini, gpt-5.2) with real conversation memory, transcript-aware prompting, and streaming responses.

The core tension: transcripts can be massive (2-hour meeting = ~48K tokens), the overlay demands low latency (user is in a live meeting), and we need the LLM to be aware of the full meeting context without blowing up cost or response time.

1. Architecture Patterns for Transcript + Conversation Memory
Pattern 1: Full Context Stuffing
Serialize entire transcript + full conversation history into every prompt.

Aspect	Detail
Mechanism	[system] [all transcript entries] [all messages] [query]
Pros	Zero information loss. Simplest to implement. Perfect for <15 min meetings
Cons	Token explosion on long meetings. 2hr meeting = ~48K tokens for transcript alone. Latency grows with prompt size
Latency	HIGH — 50K+ token prompts → 2-5s TTFT
Cache compat	GOOD if transcript placed as prefix, but any new entry invalidates cache
Complexity	1/5
Best for	Short meetings, MVP, gpt-5.2 with 128K context
Pattern 2: Sliding Window with Truncation
Keep only the last N transcript entries and last M conversation messages. Discard everything older.

Aspect	Detail
Mechanism	[system] [last 50 entries] [last 10 messages] [query]
Pros	Bounded token cost. Predictable latency. Simple implementation (just slice arrays)
Cons	Permanent information loss. "What did they say at the beginning?" fails. Window shifts break cache prefix
Latency	LOW and predictable
Cache compat	POOR — window shifts with every new entry, changing the prefix
Complexity	2/5
Best for	Quick follow-ups about recent discussion
Pattern 3: Progressive Summarization
Periodically summarize older transcript sections into a compressed "running summary." Keep summary + recent raw entries.

Aspect	Detail
Mechanism	[system] [summary of min 0-45] [raw entries min 45+] [history] [query]
Pros	Full awareness (summary) + full fidelity (recent). Bounded tokens. Summary caches well as prefix
Cons	Lossy for details (specific numbers, exact quotes). Background summarization costs tokens. Summary quality depends on prompt
Latency	MEDIUM — background async cost, but per-query latency is bounded
Cache compat	EXCELLENT — summary is stable prefix, changes only on re-summarization (~every 5 min)
Complexity	3/5
Best for	Long meetings (30+ min), general "what happened" queries
Pattern 4: RAG-Style Retrieval
Split transcript into semantic chunks, embed them, retrieve top-K relevant chunks per query.

Aspect	Detail
Mechanism	[system] [retrieved chunk 1] [retrieved chunk 2] [history] [query]
Pros	Handles arbitrarily long transcripts with fixed token cost. Highly targeted context
Cons	Requires embedding model (adds dependency + 100-500ms latency). Cross-chunk reasoning is hard. Overkill for short meetings
Latency	MEDIUM — embedding + similarity search adds 100-500ms before LLM call
Cache compat	POOR — retrieved chunks change per query
Complexity	4/5
Best for	Very long meetings (1hr+), multi-meeting recall, specific factual lookups
Pattern 5: Hybrid (Summary + Recent Window) — RECOMMENDED
Combine progressive summarization for older content with a raw recent window. Optimized for OpenAI prefix caching.

Aspect	Detail
Mechanism	[system ▸ STABLE] [summary ▸ SEMI-STABLE] [recent window ▸ SHIFTS] [history ▸ GROWS] [query ▸ VOLATILE]
Pros	Best of all worlds. Full awareness + full fidelity + bounded tokens. Excellent cache compatibility. Adapts to meeting length
Cons	Most complex. Tuning thresholds requires experimentation. Summary refresh causes brief stale periods
Latency	LOW for typical queries (cached prefix + small tail). MEDIUM for first request after summary refresh
Cache compat	EXCELLENT — system prompt + summary = stable cacheable prefix
Complexity	5/5
Best for	Production system across all meeting lengths and query types
2. Recommended Hybrid Architecture
Architecture Diagram

RENDERER (React)                    MAIN PROCESS (Node.js)
═══════════════                     ═══════════════════════════════════════

useMeetingTranscript()              LLMService
  │ entries[]                        ├── PromptAssembler
  │                                  │    ├── SystemPromptManager
useChat({ transcriptEntries })       │    ├── TranscriptContextManager
  │                                  │    │    ├── RawWindow (last N entries)
  │ sendMessage(msg)                 │    │    ├── SummaryStore
  │ ──[IPC: llm:chat]──────────►    │    │    └── TokenCounter
  │                                  │    ├── ConversationMemoryManager
  │                                  │    │    ├── RecentMessages (last K)
  │                                  │    │    └── ConversationSummary
  │                                  │    └── TokenBudgetAllocator
  │                                  │
  │                                  ├── OpenAIClient (streaming)
  │                                  │    ├── ModelRouter (nano/mini/5.2)
  │                                  │    └── AbortController (cancellation)
  │                                  │
  │ ◄──[IPC: llm:chat-delta]───     ├── BackgroundSummarizer
  │ ◄──[IPC: llm:chat-done]────     │    ├── TranscriptSummarizer (gpt5-nano)
  │ ◄──[IPC: llm:chat-error]───     │    └── ConversationSummarizer
  │                                  │
  │ resetChat()                      └── ConversationStateStore
  │ ──[IPC: llm:reset]─────────►
  │
  │ setModel(modelId)
  │ ──[IPC: llm:set-model]─────►
Token Budget Strategy

MODEL          CONTEXT    SYSTEM  TRANSCRIPT  CONV-HIST  RESPONSE  MARGIN
─────────────  ─────────  ──────  ──────────  ─────────  ────────  ──────
gpt5-nano        8,192     500     3,500       1,500      2,000     692
gpt5-mini       32,768     800    16,000       6,000      8,000    1,968
gpt-5.2        131,072   1,000   64,000      24,000     32,000   10,072
Dynamic allocation: transcript gets 70% of available context, conversation gets 30%. If one doesn't need its full allocation, the surplus goes to the other.

Request Data Flow

1. User types in InputBar
2. useChat().sendMessage(content, attachments)
3. IPC: renderer → main: 'llm:chat' { message, transcriptEntries snapshot }
4. PromptAssembler.assemble():
   a. TokenBudgetAllocator computes budgets for current model
   b. SystemPromptManager returns cached system prompt
   c. TranscriptContextManager:
      - transcript fits in budget → use raw entries
      - too large → summary + recent window
      - no summary yet → truncate + trigger urgent background summarization
   d. ConversationMemoryManager:
      - history fits → use all messages
      - too large → conversation summary + recent K messages
5. OpenAI streaming call with assembled messages[]
6. Each delta → IPC 'llm:chat-delta' → renderer accumulates + displays
7. On complete → store assistant message → IPC 'llm:chat-done'
8. Check if background summarization needed
3. Prompt Assembly Pipeline
Message Layout (optimized for prefix caching)

messages[0]: { role: 'system', content: SYSTEM_PROMPT }           ◄── STABLE (never changes during session)
messages[1]: { role: 'system', content: TRANSCRIPT_SUMMARY }      ◄── SEMI-STABLE (updates every ~5 min)
messages[2]: { role: 'system', content: RECENT_TRANSCRIPT }       ◄── SHIFTS with new entries
messages[3..N-1]: conversation history (user/assistant pairs)     ◄── APPEND-ONLY (cache-friendly)
messages[N]: { role: 'user', content: CURRENT_QUERY }             ◄── VOLATILE
System Prompt Template

You are AssistMe, an AI meeting assistant embedded in a desktop overlay.
You help users understand, navigate, and act on their meeting conversations in real time.

CAPABILITIES:
- You have access to the live meeting transcript (provided as context)
- You can summarize discussions, explain topics, draft follow-ups, answer questions
- You can see screenshots the user attaches

BEHAVIOR:
- Be concise. The user is in a live meeting and needs quick answers.
- Default to 2-3 sentence responses unless asked for detail.
- When referencing the transcript, cite the speaker name and approximate time.
- If the transcript doesn't contain enough information, say so clearly.
- Format with markdown when helpful (lists, bold for emphasis).

MEETING CONTEXT:
- Started: {{meetingStartTime}}
- Duration: {{meetingDuration}}
- Speakers: {{speakerList}}
Transcript Context Assembly Logic

IF transcript_tokens <= budget:
  → Use full raw transcript. No summarization needed.

IF transcript_tokens > budget AND summary exists:
  → Use: summary + most recent entries that fit remaining budget
  → If summary is stale (>5 min old) → trigger background re-summarization

IF transcript_tokens > budget AND no summary:
  → Truncate to most recent entries that fit
  → Trigger URGENT background summarization
  → Append note: "[Earlier transcript truncated — N older entries not shown]"
Conversation Memory Logic

IF conversation_turns <= 6:
  → Use all messages as-is

IF conversation_turns > 20 AND total_conv_tokens > budget:
  → Summarize messages[summaryEnd..length-6], keep last 6 raw

IF conversation_turns 7-20:
  → Use all if fits budget, else truncate oldest
When to Summarize vs Truncate
Summarize when you have time (background, between user messages). Truncate when you don't (user waiting, no summary available yet). Summarization is always preferred because it preserves semantic content.

4. OpenAI Caching Strategies
Key Insight
OpenAI caches the prefix of prompts. Identical prefix = cache hit. Cache key = "first N tokens." Any prefix change = full cache miss. Minimum cacheable prefix: 1024 tokens. Cache TTL: 5-10 minutes of inactivity.

Stability Gradient

MOST STABLE     System prompt              (changes: never during session)
                Transcript summary         (changes: every ~5 min)
                Recent transcript window   (changes: with new entries)
                Conversation history       (grows: every turn, append-only)
MOST VOLATILE   Current user query         (changes: every request)
Cache Hit Scenarios

Scenario 1: User asks 3 quick questions, no new transcript
  Req 1: [sys][summary][recent][q1]                → MISS (cold)
  Req 2: [sys][summary][recent][q1][a1][q2]         → HIT on [sys][summary][recent]
  Req 3: [sys][summary][recent][q1][a1][q2][a2][q3] → HIT on longer prefix

Scenario 2: New transcript entries arrive between questions
  Req 1: [sys][summary][recent_v1][q1]              → MISS
  Req 2: [sys][summary][recent_v2][q1][a1][q2]      → HIT on [sys][summary] only

Scenario 3: Summary refresh (every ~5 min)
  Req 1: [sys][summary_v1][recent][q1]              → HIT on [sys][summary_v1]
  Req 2: [sys][summary_v2][recent][q1][a1][q2]      → HIT on [sys] only (1 message)
Optimization: Transcript Window Snapshotting
To maximize cache hits during burst queries, snapshot the recent transcript window and reuse it for 10 seconds:


class TranscriptContextManager {
  private cachedWindow: string | null = null
  private cachedAt = 0
  private static SNAPSHOT_TTL = 10_000 // 10s

  getRecentWindow(entries: TranscriptEntry[], budget: number): string {
    if (this.cachedWindow && Date.now() - this.cachedAt < TranscriptContextManager.SNAPSHOT_TTL) {
      return this.cachedWindow // reuse → cache hit on OpenAI side
    }
    this.cachedWindow = formatEntries(takeRecent(entries, budget))
    this.cachedAt = Date.now()
    return this.cachedWindow
  }
}
Rules to Avoid Cache Invalidation
Do NOT put timestamps in system prompt — put meeting metadata in a separate system message
Keep transcript summary stable — only refresh on explicit summarization events (~every 5 min)
Conversation history is append-only — ideal for prefix caching
Snapshot recent window during burst queries
5. Implementation Design
5.1 New Data Structures

// ── Model Configuration ──
type ModelId = 'gpt5-nano' | 'gpt5-mini' | 'gpt-5.2'

interface ModelConfig {
  id: ModelId
  apiModel: string        // actual OpenAI API model string
  contextWindow: number
  maxResponseTokens: number
  description: string
}

// ── Conversation State ──
interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  tokenCount: number      // pre-computed on creation
  attachments?: ChatAttachment[]
  model?: ModelId         // which model generated this (assistant msgs)
}

interface ConversationState {
  sessionId: string
  messages: ConversationMessage[]
  totalTokens: number
  summary: string | null
  summaryCoversUpTo: number // index of last summarized message
}

// ── Transcript Memory ──
interface TranscriptMemoryState {
  meetingSessionId: string | null
  summary: string | null
  summaryCoversUpTo: number // index of last summarized entry
  summaryTokenCount: number
  lastSummarizedAt: number
}

// ── IPC Types ──
interface LLMChatRequest {
  requestId: string
  message: string
  attachments?: ChatAttachment[]
  transcriptEntries: TranscriptEntry[] // snapshot from renderer
}

interface LLMChatDelta { requestId: string; delta: string; index: number }
interface LLMChatDone  { requestId: string; fullContent: string; usage: LLMUsage; model: ModelId }
interface LLMChatError { requestId: string; error: string; code: string; retryable: boolean }

// ── Settings Extension ──
interface LLMSettings {
  apiKey: string           // stored encrypted via safeStorage
  defaultModel: ModelId
  temperature: number
}

// Extends existing AppSettings:
interface AppSettings {
  // ... existing fields ...
  llm: LLMSettings         // NEW
}
5.2 Main Process: LLMService
New file: desktop/src/main/llm/llm-service.ts

Core responsibilities:

Holds OpenAI client instance (API key from encrypted electron-store)
Manages active request tracking (Map<requestId, AbortController>) for cancellation
Receives chat requests via IPC, assembles prompts, streams responses back
Tracks transcript state (kept in sync via request snapshots)
Triggers background summarization when thresholds are hit
Handles model switching, conversation reset
Key methods:

handleChat(request) — assemble prompt → stream OpenAI → emit deltas → store result
cancelRequest(requestId) — abort in-flight streaming
checkSummarizationNeeded() — compare transcript tokens vs model budget
registerIpcHandlers() — wire up all llm:* IPC channels
5.3 Token Counter
New file: desktop/src/main/llm/token-counter.ts

MVP: word-count heuristic (words * 1.3). Phase 3: upgrade to gpt-tokenizer for exact counts. The heuristic is ~90% accurate for English text and avoids a WASM dependency.

5.4 Background Summarizer
New file: desktop/src/main/llm/background-summarizer.ts

Always uses gpt5-nano for cost efficiency
Transcript summarization: "Summarize preserving decisions, action items, numbers, speaker positions" → 200-400 word output
Conversation summarization: "Capture what user asked, key info provided, ongoing threads" → 100-200 word output
Incremental: incorporates previous summary + new content
5.5 Memory Lifecycle

MEETING START
  │
  ├─► Transcript entries accumulate in renderer
  │
  ├─► On user chat request:
  │     1. Snapshot entries (freeze for this request)
  │     2. Check: fits in budget? → full context or summary+window
  │     3. Stream response → store assistant message
  │     4. Check: need conversation summarization? (>20 turns, >4K tokens)
  │
  ├─► Background check (every 60s or every 50 new entries):
  │     transcript_tokens > 40% of model context?
  │       YES → summarize entries[summaryEnd..length-25], keep 25 recent raw
  │       NO  → no action
  │
  ├─► On chat reset (Alt+R):
  │     Clear conversation state, KEEP transcript summary
  │
MEETING END
  └─► Transcript saved to disk (existing behavior)
5.6 Renderer: Updated useChat Hook
Rewrite desktop/src/renderer/src/hooks/useChat.ts:

Accept transcriptEntries from useMeetingTranscript() as input
Send transcript snapshot with each chat request
Track streamingContent (accumulates deltas) separate from messages
Expose currentModel, selectModel(), hasApiKey
Listen for llm:chat-delta, llm:chat-done, llm:chat-error events
5.7 Preload API Extensions
Add to desktop/src/preload/index.ts and desktop/src/renderer/src/types/index.ts:


llmChat(request)         → ipcRenderer.send('llm:chat', request)
llmCancel(requestId)     → ipcRenderer.send('llm:cancel', requestId)
llmReset()               → ipcRenderer.send('llm:reset')
llmSetModel(modelId)     → ipcRenderer.invoke('llm:set-model', modelId)
llmGetModel()            → ipcRenderer.invoke('llm:get-model')
llmSetApiKey(apiKey)     → ipcRenderer.invoke('llm:set-api-key', apiKey)
llmHasApiKey()           → ipcRenderer.invoke('llm:has-api-key')
onLLMChatDelta(cb)       → ipcRenderer.on('llm:chat-delta')
onLLMChatDone(cb)        → ipcRenderer.on('llm:chat-done')
onLLMChatError(cb)       → ipcRenderer.on('llm:chat-error')
5.8 UI Changes
New View System: 'chat' | 'llm' | 'settings'
The current view state in Overlay.tsx toggles between 'chat' and 'settings'. This becomes a 3-way state:


const [view, setView] = useState<'chat' | 'llm' | 'settings'>('chat')
Navigation: TitleBar gets a new icon (or the gear icon opens a tab bar) for the LLM view. The LLM view is a dedicated tab for AI-related tools.

LLMView Component (new)
New file: desktop/src/renderer/src/components/LLMView.tsx

Phase 1 contents:

API Key section: Password input for OpenAI key, "Test connection" button, status indicator
Model selector: 3 cards (nano/mini/5.2) with descriptions, context window sizes, current selection highlighted
Temperature slider: 0.0–1.0 with labels ("Precise" → "Creative")
Phase 2 additions:

System Prompts section: CRUD list of user-created prompts, select active prompt, inline editor
Usage stats: Token usage, cost tracking, cache hit rate
Component Changes
ResponseCard: Show streamingContent as growing text + blinking cursor during streaming. Add model badge per assistant message.
InputBar: Add compact model badge/selector (e.g., small chip showing "mini ▾" that opens a dropdown)
TitleBar: Add LLM view icon (e.g., sparkle/brain icon) alongside the settings gear
Overlay: Wire transcript.entries into useChat({ transcriptEntries: transcript.entries }). Render <LLMView /> when view === 'llm'
6. Edge Cases & Failure Modes
Edge Case	Mitigation
Transcript explosion (2hr meeting, 48K tokens)	Background summarization kicks in at 40% of context window. 2hrs compresses to ~500 token summary + 25 recent entries (~1K tokens). Fallback: truncate if no summary ready
Context drift (30+ turns)	Conversation summarization preserves key threads. System prompt reminds model to reference transcript. Each message tagged with model ID
Model switch mid-conversation	Recalculate token budgets. Upgrading → expand window. Downgrading → trigger immediate summarization if needed. Conversation history preserved
Network failure mid-stream	Catch error → llm:chat-error with retryable: true. Partial content preserved in UI. "Retry" button resends last message. DO NOT store partial assistant response
Race condition: new transcript during LLM call	Prompt uses snapshot from request time. New entries stored but don't modify in-flight prompt. Next request gets updated context
Context overflow error from API	Catch context_length_exceeded → error message suggesting reset chat or switch to larger model
Concurrent chat requests	Only one active request allowed. Sending a new message cancels the previous one via AbortController
API key security	Key sent renderer→main once via IPC. Stored encrypted via safeStorage.encryptString(). Renderer never reads key back — only checks has-api-key
7. Phased Roadmap
Phase 1: MVP (1-2 weeks)
Goal: Replace placeholder chat with real OpenAI integration. Full context stuffing. Streaming responses.

New files:

desktop/src/main/llm/llm-service.ts — Core service (no summarization)
desktop/src/main/llm/token-counter.ts — Word-count heuristic
desktop/src/main/llm/prompt-assembler.ts — System + transcript + history + query
desktop/src/renderer/src/components/LLMView.tsx — New LLM tab (API key, model selector, temperature)
Modified files:

desktop/src/main/index.ts — Instantiate LLMService, wire IPC
desktop/src/preload/index.ts — Add llm:* IPC channels
desktop/src/renderer/src/types/index.ts — Extend ElectronAPI, ChatMessage, add LLM types
desktop/src/renderer/src/types/settings.ts — Add LLMSettings to AppSettings
desktop/src/renderer/src/hooks/useChat.ts — Rewrite for streaming
desktop/src/renderer/src/components/ResponseCard.tsx — Streaming display + model badge
desktop/src/renderer/src/components/InputBar.tsx — Compact model selector chip
desktop/src/renderer/src/components/TitleBar.tsx — Add LLM view icon (3-way navigation)
desktop/src/renderer/src/components/Overlay.tsx — 3-way view state, wire transcript into useChat, render LLMView
desktop/package.json — Add openai dependency
Scope:

New LLM tab with API key input, model cards (nano/mini/5.2), temperature slider
3-way view toggle: chat | llm | settings
Compact model badge in InputBar for quick switching
Hardcoded system prompt (no user-created prompts yet)
Full transcript stuffing (truncate from beginning if too large)
Streaming responses via IPC
Cancel/stop streaming
Error handling (network, rate limit, context overflow)
NOT in Phase 1: System prompt management, background summarization, token budget optimization, caching optimization, encrypted key storage

Phase 2: Scaling + Prompt Management (2-3 weeks)
Goal: Handle 1hr+ meetings. Background summarization. Conversation memory. System prompt CRUD.

New files:

desktop/src/main/llm/background-summarizer.ts
desktop/src/main/llm/conversation-state.ts
desktop/src/main/llm/token-budget.ts
desktop/src/main/llm/system-prompt-store.ts — CRUD for user-created system prompts (electron-store)
Scope:

Background transcript summarization (every 60s or 50 entries)
Conversation summarization (after 20 turns)
Dynamic token budget allocation per model
Summary + recent window prompt strategy
System prompt management: Create, edit, delete, select per conversation. Stored in electron-store. LLMView gets a prompt list + inline editor section
Usage/cost tracking in LLM tab
Phase 3: Optimization (2-3 weeks)
Goal: Maximize cache hits. Minimize latency. Polish UX.

Scope:

Prefix-optimized prompt layout
Transcript window snapshotting (10s TTL for burst queries)
Precise token counting (gpt-tokenizer)
API key encryption via safeStorage
Model quick-switch in TitleBar
Per-message cost/model badge
Context utilization indicator
Context-aware action chips ("Summarize meeting", "List action items", "Draft follow-up")
Verification
Unit test: Token counter accuracy against known inputs
Integration test: Prompt assembler produces valid messages array within budget for each model
Manual test: Start meeting → accumulate transcript → ask questions → verify transcript context in responses
Edge test: Let transcript grow beyond nano's context → verify truncation/summarization kicks in
Streaming test: Verify deltas arrive in order, cancel works mid-stream, errors surface in UI
Cache test: Ask 3 rapid questions → check usage.prompt_tokens_details.cached_tokens increases on 2nd/3rd
