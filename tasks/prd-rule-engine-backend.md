# PRD — Rule Engine (Backend)

> How the backend stores and executes rules built with the Rule Flow Canvas. Covers the database schema, REST surface, the DAG resolver, the Jinja sandbox, per-step types, and how meeting lifecycles fan out into rule executions.

Companion to `tasks/prd-rule-flow-canvas.md` (frontend). The two **must** stay in sync — especially `RULE_TRIGGER_NODE_ID` and the topological-sort semantics.

---

## 1. Goal

Persist user-defined automations and run them when meeting lifecycles fire (`before_meeting`, `after_meeting`, future `during_meeting`). Each rule is a DAG of steps that share a Jinja2 template context, with step outputs feeding downstream steps as `steps[i].result`. Every run is audit-logged in `rule_executions`.

---

## 2. Files

```
backend/app/
├── database/models/rule.py            # Rule, RuleStep, RuleExecution + enums
├── database/repositories/rule.py      # CRUD + flow_layout merge with sentinel
├── api/v1/rules.py                    # CRUD + /test + /executions + prompt optimizer SSE
├── services/rule_flow.py              # DAG: outgoing/incoming, Kahn topo, ancestor walk
└── services/rule_engine.py            # Jinja context build + per-step runners + execute_rule
```

---

## 3. Database schema

Three tables, one enum-as-VARCHAR per column. All timestamps are UTC-naive (`datetime.utcnow()` equivalent via `_utc_naive`).

### 3.1 Tables

| Table | Purpose | Cascade |
|---|---|---|
| `rules` | One row per user-owned rule. | Deleting user → rules deleted. |
| `rule_steps` | Ordered step list for a rule (kept for legacy / display order). | Deleting rule → steps deleted. |
| `rule_executions` | Audit log: one row per run of a rule on a meeting. | Deleting rule or meeting → executions deleted. |

### 3.2 `rules`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` PK | `uuid4()` default. |
| `user_id` | `String` FK → `users.id` ON DELETE CASCADE, indexed. | Owner. |
| `name` | `String(255)` | Required. |
| `description` | `Text` nullable | Free-form. |
| `trigger` | `VarcharEnum(32)` | `before_meeting` / `after_meeting` / `during_meeting`. Default `after_meeting`. |
| `enabled` | `Boolean` default `True` | Disabled rules are skipped at fan-out. |
| `flow_layout` | `JSON` nullable | Raw React Flow snapshot: `{ "nodes": [...], "edges": [...] }`. **Source of truth for execution order.** Nullable → legacy linear chain via `order_index`. |
| `created_at`, `updated_at` | `DateTime` | `onupdate=_utc_naive`. |

Indexes: `ix_rules_user_id`, `ix_rules_user_trigger (user_id, trigger)`.

Relationships:
- `rules.steps` — `RuleStep` ordered by `order_index`, `cascade="all, delete-orphan"`.
- `rules.executions` — `RuleExecution`, cascade delete.

### 3.3 `rule_steps`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` PK | `uuid4()`. **Same id used as React Flow node id**, so `flow_layout.edges[*].source/target` reference these rows directly. |
| `rule_id` | `String` FK → `rules.id` ON DELETE CASCADE, indexed. | |
| `order_index` | `Integer` default `0` | Topological position assigned by frontend `flowToStepDrafts`. Used as fallback when `flow_layout` is empty. |
| `name` | `String(255)` | Display name. |
| `step_type` | `VarcharEnum(32)` | `llm_prompt` / `send_email` / `push_notification` / `webhook` / `composio_action`. |
| `config` | `JSON` default `{}` | Per-type config. See §6. |

Index: `ix_rule_steps_rule_order (rule_id, order_index)`.

### 3.4 `rule_executions`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` PK | `uuid4()`. |
| `rule_id` | `String` FK → `rules.id` CASCADE | |
| `meeting_id` | `String` FK → `meetings.id` CASCADE | |
| `trigger` | `VarcharEnum(32)` | Trigger that caused the run (mirrors `rules.trigger` at run time). |
| `status` | `VarcharEnum(32)` | `pending` → `running` → `completed` / `failed`. |
| `started_at` | `DateTime` nullable | Set when transitioning to `running`. |
| `completed_at` | `DateTime` nullable | Set on terminal status. |
| `step_results` | `JSON` nullable | `list[{ step_id, name, step_type, ok, result, error }]` in run order. |
| `error` | `Text` nullable | Top-level failure message (cycle, crash, first failing step's error). |

Index: `ix_rule_executions_meeting (meeting_id, started_at)`.

### 3.5 ER summary

```
users 1—* rules 1—* rule_steps
              \—* rule_executions *—1 meetings
```

---

## 4. REST API (`/api/v1/rules`)

All endpoints require `get_current_user_with_db` (Clerk JWT). All ownership is enforced by `user_id` filter in `RuleRepository`.

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/` | — | `RuleOut[]` for current user. |
| `POST` | `/` | `RuleCreateRequest` | `RuleOut` (201). |
| `GET` | `/{rule_id}` | — | `RuleOut`. 404 if not owned. |
| `PATCH` | `/{rule_id}` | `RuleUpdateRequest` | `RuleOut`. Uses `_MISSING_FLOW` sentinel so omitted `flow_layout` ≠ `null`. |
| `DELETE` | `/{rule_id}` | — | 204. |
| `POST` | `/{rule_id}/test` | `{ meeting_id }` | `{ status, ok }`. Runs the rule synchronously against an owned meeting. |
| `GET` | `/{rule_id}/executions` | — | `RuleExecutionOut[]`. |
| `GET` | `/model-catalog` | — | `OpenRouterChatModelOut[]` — what the LLM Prompt step's model select shows. |
| `POST` | `/prompt/optimize/stream` | `{ message, current_prompt?, model }` | SSE: `data: {"text": "..."}\n\n`, terminates with `data: [DONE]\n\n`. |

### 4.1 Pydantic shapes

```python
class RuleStepIn(BaseModel):
    id: Optional[str] = None
    order_index: int = 0
    name: str = Field(..., min_length=1, max_length=255)
    step_type: str                             # validated against RuleStepTypeEnum
    config: dict[str, Any] = {}
    # llm_prompt: extra check that config.model ∈ ALLOWED_OPENROUTER_MODEL_IDS

class RuleCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    trigger: str = "after_meeting"             # validated against RuleTriggerEnum
    enabled: bool = True
    steps: list[RuleStepIn] = []
    flow_layout: Optional[dict[str, Any]] = None
```

`RuleUpdateRequest` is the same with all fields optional. `flow_layout` uses a sentinel (`_MISSING_FLOW`) inside the repository so that *omitting* the key keeps the existing layout, while *passing* `None` clears it.

---

## 5. Execution order — `services/rule_flow.py`

This is the backend twin of the frontend's `rule-flow-utils.ts`. **Identical semantics required.**

```python
RULE_TRIGGER_NODE_ID = "__rule_trigger__"   # MUST match frontend
```

### 5.1 `ordered_steps_from_flow(rule) -> (list[RuleStep], error | None)`

1. If `rule.steps` is empty → `([], None)`.
2. If `rule.flow_layout` is missing / not a dict / has no `edges` list → fallback `sorted(steps, key=order_index)`.
3. Build `outgoing: {source: [target, ...]}` (dedup, ignore non-string source/target).
4. `_reachable_step_ids` — BFS from `RULE_TRIGGER_NODE_ID` through steps in `by_id`. Edges to unknown ids are ignored.
5. `_kahn_order` over `{trigger} ∪ reachable`:
   - In-degree map.
   - Pop zero-in-degree via `heapq` (lexicographic tie-break — deterministic).
   - Emit only ids in `reachable_steps`.
   - If `popped != len(nodes)` or final length mismatch → `"Rule flow: cycle detected (steps cannot be ordered)."`
6. Return `[by_id[id] for id in order_ids]`.

### 5.2 `ancestor_step_ids_sorted(step_id, edges_raw, execution_order_ids)`

Used by the engine to scope `steps[i].result` for each step:

- If no edges → linear fallback: every step earlier in `execution_order_ids`.
- Else BFS backward along incoming edges until trigger; skip trigger; only include ids in `execution_order_ids`.
- Return ancestors **filtered through `execution_order_ids` order** so indices are deterministic.

> ⚠ `flow_layout.edges` is the only thing read from the JSON. Node positions are not used. Frontend may add nodes/edges fields freely; backend ignores everything except `edges[*].source` / `target`.

---

## 6. Step types — `services/rule_engine.py`

All step config strings pass through a **sandboxed Jinja2 environment** (`SandboxedEnvironment(autoescape=False)`). The shared context per execution is built once by `build_rule_context`.

### 6.1 Template context

```python
{
  "meeting": {
    "id", "title", "duration_seconds", "entry_count",
    "transcript",           # str — joined "speaker: text" lines from transcript_enriched.json or transcript.json
    "metadata",             # str — JSON of MeetingProcessing.result_summary
    "status", "recorded_at", "calendar_event_id",
  },
  "participants": [{ "email", "name", "response_status" }, ...],   # from CalendarEvent.participants
  "steps": [{ "result": <ancestor_result> }, ...],                 # rebuilt before EACH step
}
```

The `steps` list is **rebuilt per step** with only its ancestors, sorted by execution order. This means `steps[0].result` inside step S always means "the first ancestor of S in topo order" — matching the frontend's Input panel chip indices exactly.

### 6.2 Per-type runners

| step_type | Config keys | Output (becomes `steps[i].result`) |
|---|---|---|
| `llm_prompt` | `model`, `system_prompt`, `user_prompt_template`, `temperature`, optional `output_schema: [{name,type,description}]` | If `output_schema` non-empty → dynamic Pydantic model via `create_model` + `llm.with_structured_output(...)` → `model_dump()`. Else plain string content. |
| `send_email` | `to_template` (csv), `subject_template`, `body_template`, `body_is_html` | `{ status, body }` from Resend. Requires `RESEND_API_KEY` + `RESEND_FROM_EMAIL`. |
| `push_notification` | `title_template`, `body_template` | `{ sent, total }`. Iterates `PushRepository.list_subscriptions_for_user`, sends via `_send_one_sync` (410 = stale subscription, ignored). |
| `webhook` | `url`, `method`, `headers` (dict, leaves rendered), `body_template` *or* structured `body` | `{ status, text }` (text truncated to 8 KB). Default content-type `application/json`. |
| `composio_action` | `slug`, `arguments` (object, leaves rendered, *or* JSON string) | Composio response `model_dump()` or `{ result: str(resp) }`. Requires `COMPOSIO_API_KEY`. |

Helpers:
- `_render_template_str(s, ctx)` — single Jinja render.
- `_render_json_leaves(obj, ctx)` — recurses dict / list / str leaves; non-strings pass through. Used for headers and Composio arguments.

LLM calls go through `OpenRouterProvider().get_llm(model_name=..., enable_langfuse=True)` with metadata `{rule_id, meeting_id, user_id, kind: "rule_llm_prompt"}` and Langfuse callbacks. Never use the `openai` SDK directly — see `.cursor/rules/agent-architecture.mdc`.

---

## 7. Execution flow — `execute_rule`

```
1. Resolve trigger string.
2. Insert RuleExecution(status=RUNNING, started_at=now()).
3. Build template context (transcript, metadata, participants).
4. ordered, err = ordered_steps_from_flow(rule)
   if err  → mark FAILED with `error=err`, return.
5. order_ids = [s.id for s in ordered]
   edges_raw = rule.flow_layout.edges (or None)
   results_by_id = {}
6. For each step in `ordered`:
     ancestors = ancestor_step_ids_sorted(step.id, edges_raw, order_ids)
     context["steps"] = [{"result": results_by_id[a]} for a in ancestors]
     out, err = await _run_step(...)
     append to step_results
     if err  → mark FAILED with this error, return.
     results_by_id[step.id] = out
7. Mark COMPLETED with full step_results.
```

Each terminal transition writes to the same `RuleExecution` row via `RuleRepository.update_execution` then `db.commit()`.

### 7.1 Fan-out from meetings — `execute_rules_for_meeting(meeting_id, trigger)`

Opens its own DB session (it's called from background tasks):

```
async with get_async_session() as db:
    meeting = await MeetingRepository.get_by_id(db, meeting_id)
    rules = await RuleRepository.list_enabled_by_trigger(db, meeting.user_id, trigger)
    for rule in rules:
        try: await execute_rule(db, rule, meeting, trigger=trigger)
        except: logger.exception(...)
```

Failures in one rule never block others; each rule's outcome is visible in its own `RuleExecution` row.

### 7.2 Where it's invoked

- `before_meeting`: scheduler / calendar pre-meeting hook (when implemented per integration).
- `after_meeting`: `MeetingProcessor` calls `execute_rules_for_meeting(meeting_id, "after_meeting")` after enrichment + speaker ID complete.
- `during_meeting`: reserved for future desktop hooks; not currently fanned out.

---

## 8. Repository contract — `database/repositories/rule.py`

Key surface (consumed by API + engine):

```python
RuleRepository.list_for_user(db, user_id) -> list[Rule]
RuleRepository.get_by_id(db, rule_id, user_id, load_steps=True) -> Rule | None
RuleRepository.create_rule(db, user_id, name, *, description, trigger, enabled, steps, flow_layout)
RuleRepository.update_rule(db, rule, *, name, description, trigger, enabled, steps, flow_layout)
    # flow_layout may be _MISSING_FLOW (omit), None (clear), or dict (replace)
RuleRepository.delete_rule(db, rule)
RuleRepository.list_enabled_by_trigger(db, user_id, trigger) -> list[Rule]   # used by fan-out

RuleRepository.create_execution(db, rule_id, meeting_id, trigger, status) -> RuleExecution
RuleRepository.update_execution(db, exec, *, status, step_results, error)
RuleRepository.list_executions_for_rule(db, rule_id, user_id) -> list[RuleExecution]
```

`_MISSING_FLOW` is a sentinel so PATCH semantics match HTTP intent — only fields present in the request body modify state; passing `flow_layout: null` explicitly clears the layout.

When `steps` is replaced on update, all existing `rule_steps` rows are deleted and recreated with their (possibly-new) ids — the frontend re-uses ids it received from `RuleOut`, so unchanged steps keep their ids and `flow_layout.edges` stays valid round-trip.

---

## 9. Validation rules (server side)

| Layer | Check | Failure |
|---|---|---|
| `RuleStepIn.step_type` | ∈ `RuleStepTypeEnum` | 422 |
| `RuleStepIn.config.model` (when `step_type == llm_prompt`) | ∈ `ALLOWED_OPENROUTER_MODEL_IDS` | 422 |
| `RuleCreateRequest.trigger` / `RuleUpdateRequest.trigger` | ∈ `RuleTriggerEnum` | 422 |
| `flow_layout_error_message(raw)` | Structurally usable JSON object with optional list edges | rejected before save (helper available; routes use Pydantic dict) |
| `ordered_steps_from_flow` | DAG, no cycles | execution → `FAILED` with cycle message; rule still saved |
| `_step_send_email` | Resend key + non-empty rendered `to` | step → `failed` |
| `_step_webhook` | Non-empty url | step → `failed` |
| `_step_composio_action` | Composio key + non-empty slug + arguments resolves to object | step → `failed` |

---

## 10. Frontend ↔ backend invariants

| Invariant | Why it matters |
|---|---|
| `RULE_TRIGGER_NODE_ID = "__rule_trigger__"` in both files. | The trigger node must exist on the canvas with that id and be referenced as `source` of edges; backend uses it as BFS/topo root. |
| `RuleStep.id` is reused as React Flow node id. | Edges reference step ids; saving the layout round-trips without re-mapping. |
| `flow_layout.edges` shape: `{ source: string, target: string, ... }`. | Backend reads only these two keys; everything else (positions, type, animated, style) is opaque. |
| `output_schema` is the only place that exposes structured fields. | `_step_llm_prompt` builds a Pydantic model from it; downstream `steps[i].result.<name>` chips work because both sides agree on the same field shape. |
| `steps[i].result` indices are **per-step ancestor order**, not global `order_index`. | Frontend prior-step chips use the same indexing; if you change one side you must change the other. |

---

## 11. Acceptance checklist

- [ ] Migration creates `rules`, `rule_steps`, `rule_executions` with the indexes above.
- [ ] `POST /api/v1/rules` round-trips a rule with `flow_layout` unchanged on `GET`.
- [ ] `PATCH` without `flow_layout` keeps the previous layout; `PATCH` with `flow_layout: null` clears it.
- [ ] `POST /{rule_id}/test` with a cycle in `flow_layout.edges` returns `{ ok: false, status: "failed" }` and the execution row's `error` contains `"cycle detected"`.
- [ ] An LLM Prompt step with `output_schema` returns a dict with those fields, accessible from a downstream step as `{{ steps[0].result.<name> }}`.
- [ ] `execute_rules_for_meeting(meeting_id, "after_meeting")` runs all enabled rules for the meeting's owner, skipping disabled ones; each rule has its own `RuleExecution` row.
- [ ] Orphan steps (canvas nodes with no path from trigger) are saved but **never executed**.
- [ ] Failure of one step short-circuits the rule with `status=failed`; remaining steps are not run.
- [ ] All LLM calls use `OpenRouterProvider`; metadata includes `rule_id`, `meeting_id`, `user_id`.
