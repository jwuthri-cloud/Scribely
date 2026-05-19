# PRD — Rule Flow Canvas (Create / Edit Rules page)

> How to recreate the React Flow–based rule builder used on `/rules/new` and `/rules/[id]`, including the **Trigger → Steps** graph, the three-column **Input · Parameters · Output** inspector, the draggable variable chips, and the API contract that ties it all together.

---

## 1. Goal

Provide a visual, node-based editor where a user composes a "rule" — a DAG of steps that runs **before**, **after**, or **during** a meeting. The user must be able to:

1. Pick a lifecycle trigger (`before_meeting` / `after_meeting`).
2. Add step nodes (LLM prompt, send email, web push, webhook, Composio action).
3. Wire steps from the trigger and between each other (fan-out allowed, cycles forbidden).
4. Click any step to open an inspector that shows three panels:
   - **Input** — meeting-context variables + outputs of upstream steps, as draggable chips.
   - **Parameters** — the step-type-specific config form.
   - **Output** — schema fields (or default per type) that downstream steps can consume.
5. Drag any chip into a Jinja-aware textarea/input to insert a `{{ … }}` token.
6. Save. The graph round-trips: layout (positions + edges) is persisted alongside the executable step list.

---

## 2. Tech & Dependencies

- **React Flow** — `@xyflow/react` (v12+). Required: `ReactFlow`, `ReactFlowProvider`, `useNodesState`, `useEdgesState`, `useReactFlow`, `Background`, `Controls`, `Handle`, `addEdge`, `MarkerType`.
- **Next.js App Router** — pages must be `"use client"`.
- **Tailwind** — dark surface (`bg-zinc-900` / `bg-[#0d0d10]`), violet/amber/emerald/sky accents per node type.
- **lucide-react** — icons (`Bot`, `Mail`, `Webhook`, `Bell`, `Puzzle`, `Zap`, `Plus`, `Trash2`, `X`, `GripVertical`).
- Stylesheet: `import "@xyflow/react/dist/style.css"` is mandatory at the top of the canvas component.

---

## 3. File layout

```
frontend/src/
├── app/(app)/rules/
│   ├── new/page.tsx                  # Create rule
│   └── [id]/page.tsx                 # Edit rule (also lists executions)
└── components/app/rules/
    ├── flow/
    │   ├── constants.ts              # RULE_TRIGGER_NODE_ID = "__rule_trigger__"
    │   ├── RuleNodes.tsx             # TriggerNode + RuleStepNode + STEP_TYPE_CONFIG
    │   ├── RuleFlowCanvas.tsx        # Public canvas (Provider + inner) + Inspector
    │   └── rule-flow-utils.ts        # DAG helpers, build/serialize, topo sort
    ├── rule-templates.ts             # Starter templates for new rules
    └── StepConfigForm.tsx            # Per-step parameters + VariableChip / VariableTextarea / VariableInput
```

Backend mirror (must stay in sync):
- `backend/app/services/rule_flow.py` — same `RULE_TRIGGER_NODE_ID = "__rule_trigger__"`, same Kahn topological sort, same ancestor walk.

---

## 4. Data model & API contract

### 4.1 Frontend types

```ts
// lib/api.ts (already exists)
type RuleStepType = "llm_prompt" | "send_email" | "push_notification" | "webhook" | "composio_action"
type RuleTrigger  = "before_meeting" | "after_meeting" | "during_meeting"

type RuleStepDTO = {
  id: string
  order_index: number
  name: string
  step_type: RuleStepType
  config: Record<string, unknown>
}

type MeetingRule = {
  id: string
  name: string
  description: string | null
  trigger: RuleTrigger
  enabled: boolean
  steps: RuleStepDTO[]
  flow_layout: { nodes: Node[]; edges: Edge[] } | null
}
```

### 4.2 Save payload

`RuleFlowCanvasHandle.getSavePayload()` returns:

```ts
type RuleFlowSavePayload = {
  steps: Array<{
    id?: string
    order_index: number          // assigned by topo sort, then orphans
    name: string
    step_type: RuleStepType
    config: Record<string, unknown>
  }>
  flow_layout: { nodes: Node[]; edges: Edge[] }   // raw RF state
  error: string | null            // "Cycle detected…" if invalid
}
```

The backend uses `flow_layout.edges` to rebuild execution order at run time. `steps` is the linear fallback / display order.

### 4.3 Trigger node id

```ts
// flow/constants.ts
export const RULE_TRIGGER_NODE_ID = "__rule_trigger__"
```

This **exact** string must be reused in the backend (see `backend/app/services/rule_flow.py`). It is the only node that is `deletable: false`, has no target handle, and is the BFS root for reachability/ancestor walks.

---

## 5. Graph semantics

### 5.1 Topological execution order (Kahn, lexicographic tie-break)

`topoOrderFromEdges(edges, stepIds)`:

1. Compute `reachableStepIdsFromEdges` — BFS from `RULE_TRIGGER_NODE_ID` along outgoing edges, collecting only nodes whose id is in `stepIds`.
2. Build in-degree map for `{trigger} ∪ reachable`.
3. Pop zero-in-degree nodes, **sorted lexicographically by id** (deterministic save). The trigger itself is popped first but not emitted.
4. If `popped !== nodes.size` → return `error: "Cycle detected in flow — remove a connection to fix."`
5. Result: `order: string[]` — step ids in execution order.

### 5.2 Orphan handling

Steps on the canvas with no path from the trigger are **orphans**. They are still saved (sorted by id, after reachable steps) so the user does not silently lose work — but execution skips them.

### 5.3 `flowToStepDrafts(nodes, edges)` (used by `getSavePayload`)

```
drafts = []
idx = 0
for id in topoIds:        push StepDraft(order_index = idx++, ...)
for id in orphanIds:      push StepDraft(order_index = idx++, ...)   // sorted lexicographically
return { drafts, error, orphanIds }
```

### 5.4 Ancestor walk (for the Input panel)

`priorStepDraftsOrdered(selectedId, allDrafts, edges, stepNodeIds)`:

- BFS **backward** along incoming edges from `selectedId`, collecting strict ancestors only.
- Skips trigger.
- Returns ancestors sorted by `order_index`.
- This is what the **Input** side panel renders as "Prior steps" — it is intentionally **not** all upstream-by-order steps; parallel siblings are correctly excluded so the user only sees variables they can actually consume.

---

## 6. Trigger node (`RuleNodes.tsx › TriggerNode`)

- Single fixed instance, id `RULE_TRIGGER_NODE_ID`, `deletable: false`.
- Position: `{ x: 80, y: 140 }` by default.
- Visual: 220 px wide, amber accent (`#fbbf24`), `Zap` icon, gradient header.
- Contains a `<select>` for `before_meeting | after_meeting` (and `during_meeting` only if already set, marked legacy). Selection updates `data.trigger` and `data.label` via `setNodes`. The `<select>` wrapper has `nodrag nopan` so React Flow doesn't capture pointer events on it.
- **Source handle only** (right side, large 24 px, 3 px ring matching canvas bg `#0d0d10`, hover scales 1.25). No target handle.
- `onNodesChange` filter (in canvas) drops any `remove` change with `id === RULE_TRIGGER_NODE_ID` as a belt-and-suspenders defense:
  ```ts
  const filtered = changes.filter(c => !(c.type === "remove" && "id" in c && c.id === RULE_TRIGGER_NODE_ID))
  ```

---

## 7. Step node (`RuleNodes.tsx › RuleStepNode`)

- 230 px wide card with a left accent bar colored per `step_type`.
- Header: type-specific icon in tinted square + `STEP_TYPE_CONFIG[step_type].label` + truncated `data.name`.
- **Two handles**: target on left (zinc), source on right (accent). Both 24 px, `nodrag` not needed — they live outside the dragable area.
- Selection state: `border-${accent}` plus `boxShadow: 0 0 0 3px ${accent}44`. The `accent`/`gradientFrom`/`iconBg`/`iconFg` for each type come from `STEP_TYPE_CONFIG`.

`STEP_TYPE_CONFIG` (single source of truth, used by node, NodePicker, InspectorPanel header):

| step_type           | label         | icon    | accent    |
|---------------------|---------------|---------|-----------|
| `llm_prompt`        | LLM Prompt    | Bot     | `#8b5cf6` violet  |
| `send_email`        | Send Email    | Mail    | `#38bdf8` sky     |
| `push_notification` | Web Push      | Bell    | `#fbbf24` amber   |
| `webhook`           | Webhook       | Webhook | `#34d399` emerald |
| `composio_action`   | Composio      | Puzzle  | `#e879f9` fuchsia |

---

## 8. Canvas (`RuleFlowCanvas.tsx`)

### 8.1 Public surface

```ts
export type RuleFlowCanvasHandle = {
  getSavePayload: () => RuleFlowSavePayload
  getTrigger: () => RuleTrigger
}

<RuleFlowCanvas
  ref={flowRef}
  initialNodes={…}
  initialEdges={…}
/>
```

The component is `forwardRef` and exposes the handle via `useImperativeHandle`. The page calls `flowRef.current?.getSavePayload()` on submit.

The public component wraps an inner `RuleFlowInner` in `<ReactFlowProvider>` so `useReactFlow()` works (we call `screenToFlowPosition` to spawn a new step in the visible viewport).

### 8.2 Internal state

```ts
const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes)
const [edges, setEdges, onEdgesChange]     = useEdgesState(initialEdges.map(applyEdgeDefaults))
const [selectedId, setSelectedId]          = useState<string | null>(null)
const [pickerOpen, setPickerOpen]          = useState(false)
const [selectedEdgeIds, setSelectedEdgeIds]= useState<ReadonlySet<string>>(new Set())
```

### 8.3 Edge defaults & selection highlight

```ts
const EDGE_DEFAULTS = {
  type: "smoothstep",
  animated: true,
  interactionWidth: 28,             // wide hit target for clicks
  selectable: true,
  deletable: true,
  style: { stroke: "rgba(255,255,255,0.25)", strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(255,255,255,0.35)" },
}
```

Because RF's default `.selected` CSS is overridden by inline `style.stroke`, we re-derive the rendered edges via `edgesWithSelectionHighlight(edges, selectedEdgeIds)` — when selected we swap to `rgba(196,181,253,0.98)` (violet), bump `strokeWidth: 3`, recolor the marker, raise `zIndex: 1001`. We track selection via `onSelectionChange` so the highlight survives prop changes.

### 8.4 Connect / select / delete

```ts
onConnect = (params) => {
  if (!params.source || !params.target) return
  if (params.target === RULE_TRIGGER_NODE_ID) return     // never wire INTO the trigger
  setEdges(eds => addEdge({ ...EDGE_DEFAULTS, ...params, id: `e-${source}-${target}` }, eds))
}

onSelectionChange = ({ nodes, edges }) => {
  setSelectedEdgeIds(new Set(edges.map(e => e.id)))
  if (edges.length > 0 && nodes.length === 0) setSelectedId(null)
  else setSelectedId(nodes[0]?.type === "ruleStep" ? nodes[0].id : null)
}

deleteKeyCode = ["Backspace", "Delete"]   // RF prop; deletes selected edges/nodes
```

`onPaneClick` clears `selectedId` and closes the picker. Edge clicks blur the active element to keep keyboard focus consistent.

### 8.5 Add Step (NodePicker)

- A small popover (`<NodePicker>`) anchored to the **Add step** button (top-right toolbar), open on click.
- Lists all 5 step types with icon, label, and slug. Click → `addStep(stepType)`:
  1. Generate id via `crypto.randomUUID()` (fallback `s-${Date.now()}`).
  2. Create config via `defaultConfig(stepType)` (shared with `StepConfigForm`).
  3. Position: center of viewport via `screenToFlowPosition`, then nudge by `(nSteps % 6) * 28, (nSteps % 4) * 22` so consecutive adds don't overlap.
  4. Append node to `nodes`, set `selectedId`, close picker.
- Picker closes on outside pane click, on `X` button, or after pick.

### 8.6 ReactFlow props

```tsx
<ReactFlow
  nodes={nodes}
  edges={edgesForFlow}                // = edgesWithSelectionHighlight(edges, selectedEdgeIds)
  onNodesChange={onNodesChange}       // filtered to block trigger removal
  onEdgesChange={onEdgesChange}
  onConnect={onConnect}
  onSelectionChange={onSelectionChange}
  onEdgeClick={onEdgeClick}
  deleteKeyCode={["Backspace","Delete"]}
  defaultEdgeOptions={EDGE_DEFAULTS}
  nodeTypes={{ trigger: TriggerNode, ruleStep: RuleStepNode }}
  fitView
  fitViewOptions={{ padding: 0.3 }}
  autoPanOnNodeFocus={false}
  minZoom={0.3}
  maxZoom={1.8}
  proOptions={{ hideAttribution: true }}
  onPaneClick={() => { setSelectedId(null); setPickerOpen(false) }}
>
  <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgba(255,255,255,0.07)" />
  <Controls className="!border-white/[0.08] !bg-zinc-900/95 …" />
</ReactFlow>
```

### 8.7 Layout shell (fixed heights matter)

```
┌────────────────────────────────────────┐  rounded-2xl
│ Toolbar (count · hints · Add step)     │  border-b
├────────────────────────────────────────┤
│ React Flow canvas — height 440 px      │  fixed
├────────────────────────────────────────┤
│ Inspector panel — height 600 px        │  fixed (1040 total)
└────────────────────────────────────────┘
```

Both halves use `min-h-0 + overflow-hidden` so a long form doesn't grow the page; the inner inspector handles its own scrolling.

---

## 9. Inspector — three columns

When `selectedId` points at a `ruleStep` node we render `<InspectorPanel>` (else `<EmptyConfigPlaceholder>`):

```tsx
<div className="grid grid-cols-[200px_minmax(0,1fr)_200px] divide-x divide-zinc-700/60 …">
  <InputSidePanel  stepType … priorDrafts … />        {/* 200 px */}
  <StepConfigForm  step … onChange={updateSelectedStep} />   {/* flex */}
  <OutputSidePanel stepType … runPosition1Based … outputSchema … />   {/* 200 px */}
</div>
```

Header row above the grid: gradient using `STEP_TYPE_CONFIG[step.step_type].gradientFrom`, icon, `Step N — <label>`, name, and a red `Trash2` button → `removeSelectedStep` (also filters edges touching that node).

### 9.1 Input panel

Two sections:

1. **Meeting context** — fixed list of `VariableChip`s:
   - `meeting.id`, `meeting.title`, `meeting.recorded_at`, `meeting.transcript`, `meeting.metadata`
   - Plus a non-draggable `participants (array)` muted chip.
2. **Prior steps** — only shown if `priorDrafts.length > 0`. For each ancestor draft (from `priorStepDraftsOrdered`):
   - Title `${i+1}. ${draft.name}` (i is **the prior-list index**, not global order_index — see §10).
   - If `draft.config.output_schema` is a non-empty array → one chip per field: `steps[i].result.<name>`.
   - Else → a single chip `steps[i].result`.
   - Chip token format: `{{ steps[i].result.<name> }}` or `{{ steps[i].result }}`.

If no priors: a small hint "No upstream steps on this branch…".

> **Important**: the `i` in `steps[i]` here is the prior-list index. Drafts inserted by the user before this step (via the inspector header order) should match the order the **runtime** expects. Because `flowToStepDrafts` topologically sorts and assigns `order_index`, and the run-time service exposes `steps[order_index]`, we display `i = order_index_within_priors` — same convention used by the backend's `ancestor_step_ids_sorted`. ⚠ Keep these aligned with backend.

### 9.2 Output panel

Receives `stepType`, `runPosition1Based`, `totalFlowSteps`, optional `outputSchema`.

- If `outputSchema` is a non-empty array (LLM Prompt's structured output) → render those fields with `{ key, desc }`.
- Otherwise fall back to a default per type:
  - `llm_prompt` → `result : model response text`
  - `send_email` → `status : HTTP status from Resend`, `body : JSON response object`
  - `push_notification` → `sent`, `total`
  - `webhook` → `status`, `text`
  - `composio_action` → `result : Composio tool response`
- Caption: `Run order: ${runPosition1Based} of ${totalFlowSteps}` plus a hint about how to use the chips downstream.

### 9.3 Parameters (`StepConfigForm.tsx`)

Renders a step-type-specific form. Keys we **must** support per type:

- `llm_prompt`: `model` (select from `ChatModelOption[]`, fallback `FALLBACK_LLM_MODELS`), `system_prompt`, `user_prompt_template`, `temperature` (0–1), `output_schema: OutputSchemaField[]` editor (name / type ∈ string|number|boolean|array / description).
- `send_email`: `to_template`, `subject_template`, `body_template`, `body_is_html: boolean`.
- `push_notification`: `title_template`, `body_template`.
- `webhook`: `url`, `method` (GET/POST/PUT/PATCH/DELETE), `headers` (key-value editor), `body_template`.
- `composio_action`: `slug`, `arguments` (key-value editor).

All template fields must use the Jinja-aware components below.

---

## 10. Variable chips & Jinja-aware inputs

### 10.1 `VariableChip`

Draggable pill rendering `label` text, payloading `varToken`:

```tsx
<span
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData(DRAG_TYPE, varToken)         // "text/x-variable"
    e.dataTransfer.setData("text/plain", varToken)      // graceful degrade
    e.dataTransfer.effectAllowed = "copy"
  }}
  className="inline-flex items-center gap-1 rounded-md border border-emerald-600/40 bg-emerald-900/50 px-2 py-1 font-mono text-[11px] text-emerald-300 cursor-grab"
>
  <GripVertical /> {label}
</span>
```

### 10.2 `VariableTextarea` / `VariableInput`

Both render two stacked layers in a positioned wrapper:

1. **Mirror** (`<div aria-hidden>`): renders the value with `{{ … }}` substrings wrapped in `<mark class="va-chip">…</mark>`. HTML-escapes `&<>` and converts `\n` → `<br/>`. Trailing `\u200b` keeps the last line measurable.
2. **Real input/textarea**: same padding/font, color set to `transparent`, `caret` visible. The mirror shows through.

Drop handlers on the wrapper:

```tsx
onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
onDragLeave={() => setIsDragOver(false)}
onDrop={(e) => {
  e.preventDefault(); setIsDragOver(false)
  const token = e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData("text/plain")
  if (token) insertAtCursor(token)
}}
```

`insertAtCursor` reads `selectionStart/selectionEnd`, splices the token in, calls `onChange(next)`, then in a `requestAnimationFrame` restores the caret to `start + token.length` and focuses the field.

A `va-chip` CSS rule highlights the mirrored token (rounded background, emerald text). Required global CSS:

```css
.va-chip {
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
  border-radius: 4px;
  padding: 0 2px;
}
```

---

## 11. Building flows — three entry points

### 11.1 `initialNewRuleFlow(trigger = "after_meeting")`

Returns one trigger node + one disconnected starter step (default `llm_prompt`). The user is forced to wire it (so the Save button stays disabled until they do, with a helpful error).

### 11.2 `RULE_TEMPLATES` (`rule-templates.ts`)

Buttons on `/rules/new` that call `applyTemplate(id)`:

- **Before reminder** — `before_meeting` + a wired `push_notification` ("Reminder: {{ meeting.title }}").
- **After summary email** — `after_meeting` → `llm_prompt` (HTML summary) → `send_email` (`body_template: "<div>{{ steps[0].result }}</div>"`).

Template selection sets name + description, replaces `flowSeed`, and bumps `flowKey` to remount the canvas (cheapest reset).

### 11.3 `buildFlowFromRule(rule)` (edit page)

If `rule.flow_layout?.nodes?.length > 0`: hydrate trigger node (`hydrateFlowTriggerNodes`) — backfills `data.trigger` / `data.label` from `rule.trigger` if missing, sets `deletable: false` — then return its nodes/edges verbatim.

Else fall back to `synthesizeChain(rule.steps, rule.trigger)`: a horizontal trigger → s0 → s1 → … chain at `y = 60..100`, `x = 260 + i * 260`. This is the legacy path for rules created before the canvas existed.

---

## 12. Page wiring — `/rules/new/page.tsx`

```tsx
const [name, setName]     = useState("")
const [description, setDescription] = useState("")
const flowRef = useRef<RuleFlowCanvasHandle>(null)
const [flowKey, setFlowKey] = useState(0)
const [flowSeed, setFlowSeed] = useState(() => initialNewRuleFlow())

submit:
  const payload = flowRef.current?.getSavePayload()
  if (payload.error)         setErr(payload.error); return
  if (payload.steps.length === 0) setErr("Add at least one step…"); return
  await api.createRule({
    name, description: description || null,
    trigger: flowRef.current.getTrigger(),
    enabled: true,
    steps: payload.steps,
    flow_layout: payload.flow_layout,
  })
  router.push(`/rules/${created.id}`)
```

The page also renders the template grid above the form. Picking a template calls `setFlowSeed(t.buildFlow()); setFlowKey(k => k + 1)`, which remounts `<RuleFlowCanvas key={flowKey} … />`.

## 13. Page wiring — `/rules/[id]/page.tsx`

- Loads `rule + executions` in parallel.
- `flowInitial = useMemo(() => buildFlowFromRule(rule), [rule, flowKey])` is fed to the canvas.
- Save merges into `api.updateRule(id, { name, description, trigger, steps, flow_layout })` — same payload shape as create, no `enabled` change here (separate toggle).
- Bottom of page shows `RuleExecutionSteps` for each past run.

---

## 14. Validation rules (frontend)

Save is rejected if:

| Condition | Message |
|---|---|
| `name.trim() === ""` | "Name is required" |
| `flowRef.current` is null | "Flow editor is not ready." |
| `payload.error` is set (cycle) | "Cycle detected in flow — remove a connection to fix." (passed through) |
| `payload.steps.length === 0` | "Add at least one step node and connect it from the trigger." |

The toolbar in the canvas also surfaces `Fix cycle to save` next to the step count when `flowToStepDrafts` errors, so the user sees the problem before clicking Save.

---

## 15. Backend contract (recap, to keep both sides consistent)

`backend/app/services/rule_flow.py` must mirror these rules — see `RULE_TRIGGER_NODE_ID`, `_build_outgoing/_build_incoming`, Kahn topo sort, ancestor walk. **Any change to graph semantics must be made in both files.** Specifically:

- Trigger id: `__rule_trigger__` (string equality).
- Edges with unknown `source`/`target` are ignored.
- Duplicate edges deduped per source.
- Reachability only through `stepIds` (orphan steps don't count as reachable).
- Cycle → execution fails (frontend blocks save first).

---

## 16. Acceptance checklist

- [ ] Trigger node cannot be deleted (Backspace, Delete, RF onNodesChange `remove`).
- [ ] Cannot connect any edge **into** the trigger.
- [ ] Adding a step via the picker spawns it in viewport, selects it, opens inspector, closes picker.
- [ ] Edges have a 28 px hit target; clicking an edge highlights it violet and Backspace removes it.
- [ ] Selecting a step opens the 3-column inspector, height 600 px, none of the three columns expand the page.
- [ ] Input panel shows meeting chips always; "Prior steps" only shows actual ancestors via incoming-edge BFS.
- [ ] Dragging any chip into a `VariableTextarea` inserts `{{ … }}` at the caret and highlights it.
- [ ] LLM Prompt's `output_schema` rows show as both Output panel chips and downstream Input chips (`steps[i].result.<name>`).
- [ ] Cycles are blocked at save time with a message; orphans are saved with later `order_index`.
- [ ] `flow_layout` round-trips: editing, saving, reloading reproduces the same node positions and edges.
- [ ] Templates fill name/description and reset the canvas via `flowKey` remount.
- [ ] Backend `RULE_TRIGGER_NODE_ID` matches the frontend constant.

---

## 17. Out-of-scope / future work

- Multi-select of nodes for bulk delete (RF supports it; we currently inspect a single node).
- Inline rename in the step header (today the name is editable inside `StepConfigForm`).
- Undo/redo stack on graph edits.
- Per-node validation chips on the canvas (e.g. "missing recipient" badge on `send_email`).
- Live test-run from a step (today only whole-rule "Run on meeting" exists on the edit page).
