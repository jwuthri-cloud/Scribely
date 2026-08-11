"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import type { ChatModelOption, RuleStepType } from "@/lib/api"
import { cn } from "@/lib/utils"

export type StepDraft = {
  /** Stable id for React Flow / API round-trip */
  id?: string
  order_index: number
  name: string
  step_type: RuleStepType
  config: Record<string, unknown>
}

export type OutputSchemaField = {
  name: string
  type: "string" | "number" | "boolean" | "array"
  description?: string
}

const STEP_TYPES: { value: RuleStepType; label: string }[] = [
  { value: "llm_prompt", label: "LLM prompt" },
  { value: "send_email", label: "Send email (Resend)" },
  { value: "push_notification", label: "Web push" },
  { value: "webhook", label: "Webhook" },
  { value: "composio_action", label: "Composio action" },
]

const FALLBACK_LLM_MODELS: ChatModelOption[] = [
  {
    id: "openai/gpt-5.6-luna",
    label: "GPT 5.6 Luna",
    description: "Fast, low cost",
    provider: "openai",
  },
  {
    id: "openai/gpt-5.6-terra",
    label: "GPT 5.6 Terra",
    description: "Balanced speed and quality",
    provider: "openai",
  },
  {
    id: "anthropic/claude-4.5-haiku",
    label: "Claude 4.5 Haiku",
    description: "Fast Anthropic model",
    provider: "anthropic",
  },
  {
    id: "google/gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
    description: "Lightweight Google model",
    provider: "google",
  },
  {
    id: "google/gemini-3.1-flash-preview",
    label: "Gemini 3.1 Flash",
    description: "Fast Google flagship",
    provider: "google",
  },
]

const SCHEMA_TYPES = ["string", "number", "boolean", "array"] as const

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

export function defaultConfig(t: RuleStepType): Record<string, unknown> {
  switch (t) {
    case "llm_prompt":
      return {
        model: "openai/gpt-5.6-terra",
        system_prompt: "You are a helpful assistant summarizing meeting content.",
        user_prompt_template:
          "Summarize the following transcript in 5 bullet points:\n\n{{ meeting.transcript }}",
        temperature: 0.2,
        output_schema: [{ name: "result", type: "string", description: "Model output" }],
      }
    case "send_email":
      return {
        to_template: "{{ meeting.title }}@example.com",
        subject_template: "Meeting: {{ meeting.title }}",
        body_template: "<p>{{ meeting.metadata }}</p>",
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

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback
}

function record(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/* ── drag-and-drop token: "text/x-variable" carries the {{ ... }} string ── */
export const DRAG_TYPE = "text/x-variable"

/**
 * A draggable pill chip representing a Jinja variable.
 * label: what users see. varToken: the full `{{ var }}` string dropped.
 */
export function VariableChip({
  label,
  varToken,
  className,
}: {
  label: string
  varToken: string
  className?: string
}) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, varToken)
        e.dataTransfer.setData("text/plain", varToken)
        e.dataTransfer.effectAllowed = "copy"
      }}
      title={`Drag to insert ${varToken}`}
      className={cn(
        "inline-flex cursor-grab items-center gap-1 rounded-md border border-emerald-600/40 bg-emerald-900/50 px-2 py-1 font-mono text-[11px] text-emerald-300 select-none active:cursor-grabbing hover:border-emerald-500/70 hover:bg-emerald-900/70 transition-colors",
        className
      )}
    >
      <GripVertical className="h-2.5 w-2.5 shrink-0 text-emerald-500/60" />
      {label}
    </span>
  )
}

/** Renders `{{ ... }}` tokens as highlighted marks over a transparent textarea. */
export function VariableTextarea({
  value,
  onChange,
  rows,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  rows: number
  placeholder?: string
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  /* Build highlighted HTML — escape HTML then wrap {{ ... }} in <mark> */
  const highlighted = useMemo(() => {
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>")
    return escaped.replace(
      /(\{\{[^}]*\}\})/g,
      '<mark class="va-chip">$1</mark>'
    )
  }, [value])

  const insertAtCursor = useCallback(
    (token: string) => {
      const ta = taRef.current
      if (!ta) return
      const start = ta.selectionStart ?? value.length
      const end = ta.selectionEnd ?? value.length
      const next = value.slice(0, start) + token + value.slice(end)
      onChange(next)
      // restore cursor after the inserted token
      requestAnimationFrame(() => {
        ta.setSelectionRange(start + token.length, start + token.length)
        ta.focus()
      })
    },
    [value, onChange]
  )

  return (
    <div
      className={cn(
        "va-wrap relative min-w-0 rounded-lg border bg-zinc-950 transition-colors [color-scheme:dark]",
        isDragOver
          ? "border-emerald-500/70 ring-1 ring-emerald-500/30"
          : "border-zinc-600/90 focus-within:border-violet-500/55 focus-within:ring-1 focus-within:ring-violet-500/35"
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragOver(false)
        const token =
          e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData("text/plain")
        if (token) insertAtCursor(token)
      }}
    >
      {/* mirror overlay */}
      <div
        aria-hidden
        className="va-mirror pointer-events-none absolute inset-0 overflow-hidden rounded-lg px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: highlighted + "\u200b" }}
      />
      {/* actual textarea — transparent text so the mirror shows through */}
      <textarea
        ref={taRef}
        value={value}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="relative w-full resize-none bg-transparent px-3 py-2 font-mono text-xs leading-relaxed text-transparent caret-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        style={{ minHeight: `${rows * 1.6}rem` }}
      />
    </div>
  )
}

/** Single-line equivalent with chip highlighting */
export function VariableInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const highlighted = useMemo(() => {
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    return escaped.replace(
      /(\{\{[^}]*\}\})/g,
      '<mark class="va-chip">$1</mark>'
    )
  }, [value])

  const insertAtCursor = useCallback(
    (token: string) => {
      const el = inputRef.current
      if (!el) return
      const start = el.selectionStart ?? value.length
      const end = el.selectionEnd ?? value.length
      const next = value.slice(0, start) + token + value.slice(end)
      onChange(next)
      requestAnimationFrame(() => {
        el.setSelectionRange(start + token.length, start + token.length)
        el.focus()
      })
    },
    [value, onChange]
  )

  return (
    <div
      className={cn(
        "va-wrap relative h-10 rounded-lg border bg-zinc-950 transition-colors [color-scheme:dark]",
        isDragOver
          ? "border-emerald-500/70 ring-1 ring-emerald-500/30"
          : "border-zinc-600/90 focus-within:border-violet-500/55 focus-within:ring-1 focus-within:ring-violet-500/35"
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragOver(false)
        const token =
          e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData("text/plain")
        if (token) insertAtCursor(token)
      }}
    >
      <div
        aria-hidden
        className="va-mirror pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-lg px-3 font-mono text-xs whitespace-nowrap"
        dangerouslySetInnerHTML={{ __html: highlighted || `<span class="va-placeholder">${placeholder ?? ""}</span>` }}
      />
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="relative h-full w-full bg-transparent px-3 font-mono text-xs text-transparent caret-zinc-100 placeholder:text-transparent focus:outline-none"
      />
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-zinc-300">{label}</label>
        {hint}
      </div>
      {children}
    </div>
  )
}

const controlClass =
  "w-full rounded-lg border border-zinc-600/90 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 caret-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-zinc-500 focus:border-violet-500/55 focus:outline-none focus:ring-1 focus:ring-violet-500/35 [color-scheme:dark]"

const inputClass = controlClass
const selectClass = cn(controlClass, "cursor-pointer bg-zinc-950")

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        checked
          ? "border-emerald-500/35 bg-emerald-500/10"
          : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]"
      )}
    >
      <span className="text-sm text-white/80">{label}</span>
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-emerald-500/80" : "bg-white/15"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  )
}

type KvRow = { key: string; value: string }

function objectToRows(obj: Record<string, unknown>): KvRow[] {
  const entries = Object.entries(obj)
  if (entries.length === 0) return [{ key: "", value: "" }]
  return entries.map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }))
}

function rowsToObject(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const k = row.key.trim()
    if (k) out[k] = row.value
  }
  return out
}

function KeyValueEditor({
  rows,
  onChange,
  valuePlaceholder,
  valueAsVariable,
}: {
  rows: KvRow[]
  onChange: (next: KvRow[]) => void
  valuePlaceholder?: string
  valueAsVariable?: boolean
}) {
  const add = () => onChange([...rows, { key: "", value: "" }])
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i)
    onChange(next.length ? next : [{ key: "", value: "" }])
  }
  const setRow = (i: number, patch: Partial<KvRow>) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        <span>Key</span>
        <span className="col-span-2 sm:col-span-1">Value</span>
        <span className="hidden sm:block" />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_1.2fr_auto] sm:items-center">
          <input
            value={row.key}
            onChange={(e) => setRow(i, { key: e.target.value })}
            placeholder="key"
            className={inputClass + " font-mono text-xs"}
          />
          {valueAsVariable ? (
            <VariableInput
              value={row.value}
              onChange={(v) => setRow(i, { value: v })}
              placeholder={valuePlaceholder ?? "value"}
            />
          ) : (
            <input
              value={row.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
              placeholder={valuePlaceholder ?? "value"}
              spellCheck={false}
              className={inputClass + " font-mono text-xs"}
            />
          )}
          <button
            type="button"
            onClick={() => remove(i)}
            className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-lg border border-white/[0.08] text-white/40 hover:bg-red-500/15 hover:text-red-400 sm:self-center"
            aria-label="Remove row"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] px-3 py-2 text-xs text-white/55 hover:border-violet-500/35 hover:bg-violet-500/10 hover:text-white/80"
      >
        <Plus className="h-3.5 w-3.5" />
        Add row
      </button>
    </div>
  )
}

/* ── Schema builder ─────────────────────────────────────────────────────── */
function SchemaBuilder({
  fields,
  onChange,
}: {
  fields: OutputSchemaField[]
  onChange: (next: OutputSchemaField[]) => void
}) {
  const add = () =>
    onChange([...fields, { name: "", type: "string", description: "" }])
  const remove = (i: number) => onChange(fields.filter((_, j) => j !== i))
  const setField = (i: number, patch: Partial<OutputSchemaField>) =>
    onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-700/70 bg-zinc-950">
      {/* header */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_100px_minmax(0,1fr)_32px] gap-0 border-b border-zinc-700/70 bg-zinc-900/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        <span className="min-w-0">Field name</span>
        <span>Type</span>
        <span className="min-w-0">Description</span>
        <span />
      </div>

      {/* rows */}
      {fields.map((f, i) => (
        <div
          key={i}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_100px_minmax(0,1fr)_32px] items-center gap-0 border-b border-zinc-800/60 last:border-0"
        >
          <div className="min-w-0 overflow-hidden border-r border-zinc-800/60 px-2 py-1.5">
            <input
              value={f.name}
              onChange={(e) => setField(i, { name: e.target.value })}
              placeholder="field_name"
              spellCheck={false}
              className="w-full min-w-0 bg-transparent font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          <div className="min-w-0 border-r border-zinc-800/60 px-2 py-1.5">
            <select
              value={f.type}
              onChange={(e) => setField(i, { type: e.target.value as OutputSchemaField["type"] })}
              className="w-full min-w-0 bg-transparent text-xs text-zinc-100 focus:outline-none [color-scheme:dark] cursor-pointer"
            >
              {SCHEMA_TYPES.map((t) => (
                <option key={t} value={t} className="bg-zinc-950 text-zinc-100">
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 overflow-hidden border-r border-zinc-800/60 px-2 py-1.5">
            <input
              value={f.description ?? ""}
              onChange={(e) => setField(i, { description: e.target.value })}
              placeholder="optional…"
              className="w-full min-w-0 bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => remove(i)}
              className="flex h-7 w-7 items-center justify-center text-zinc-600 hover:text-red-400 transition-colors"
              aria-label="Remove field"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}

      {/* add row */}
      <button
        type="button"
        onClick={add}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add field
      </button>
    </div>
  )
}

/* ── Per-type field sets ──────────────────────────────────────────────────── */

function LlmFields({
  config,
  patch,
  modelCatalog,
}: {
  config: Record<string, unknown>
  patch: (p: Record<string, unknown>) => void
  modelCatalog: ChatModelOption[]
}) {
  const model = str(config.model, "openai/gpt-5.6-terra")
  const systemPrompt = str(config.system_prompt)
  const userTmpl = str(config.user_prompt_template)
  const temperature = num(config.temperature, 0.2)
  const rawSchema = config.output_schema
  const outputSchema: OutputSchemaField[] = Array.isArray(rawSchema)
    ? (rawSchema as OutputSchemaField[])
    : [{ name: "result", type: "string", description: "Model output" }]
  const activeModel = modelCatalog.some((m) => m.id === model)
    ? model
    : modelCatalog[0]?.id ?? "openai/gpt-5.6-terra"

  useEffect(() => {
    if (modelCatalog.length > 0 && activeModel !== model) {
      patch({ model: activeModel })
    }
  }, [activeModel, model, modelCatalog.length, patch])

  return (
    <div className="space-y-4">
      <Field label="Model">
        <select value={activeModel} onChange={(e) => patch({ model: e.target.value })} className={selectClass}>
          {modelCatalog.map((m) => (
            <option key={m.id} value={m.id} className="bg-zinc-950">
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="System prompt">
        <VariableTextarea
          value={systemPrompt}
          onChange={(v) => patch({ system_prompt: v })}
          rows={3}
          placeholder="You are a helpful assistant…"
        />
      </Field>
      <Field label="User prompt">
        <VariableTextarea
          value={userTmpl}
          onChange={(v) => patch({ user_prompt_template: v })}
          rows={5}
          placeholder="Summarize…"
        />
      </Field>
      <Field
        label="Temperature"
        hint={<span className="text-[10px] text-zinc-500">0–2, lower = more deterministic</span>}
      >
        <input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) => patch({ temperature: parseFloat(e.target.value) || 0 })}
          className={inputClass}
        />
      </Field>

      {/* Output schema — always structured */}
      <div className="border-t border-zinc-700/50 pt-4 space-y-2">
        <div>
          <p className="text-xs font-medium text-zinc-300">Output schema</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Define the fields the LLM must return</p>
        </div>
        <SchemaBuilder
          fields={outputSchema}
          onChange={(next) => patch({ output_schema: next })}
        />
      </div>
    </div>
  )
}

function EmailFields({
  config,
  patch,
}: {
  config: Record<string, unknown>
  patch: (p: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-4">
      <Field label="To">
        <VariableInput
          value={str(config.to_template)}
          onChange={(v) => patch({ to_template: v })}
          placeholder="you@example.com or drop a variable"
        />
      </Field>
      <Field label="Subject">
        <VariableInput value={str(config.subject_template)} onChange={(v) => patch({ subject_template: v })} />
      </Field>
      <Field label="Body">
        <VariableTextarea value={str(config.body_template)} onChange={(v) => patch({ body_template: v })} rows={5} />
      </Field>
      <Toggle
        label="Body is HTML"
        checked={bool(config.body_is_html, true)}
        onChange={(v) => patch({ body_is_html: v })}
      />
    </div>
  )
}

function PushFields({
  config,
  patch,
}: {
  config: Record<string, unknown>
  patch: (p: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-4">
      <Field label="Title">
        <VariableInput value={str(config.title_template)} onChange={(v) => patch({ title_template: v })} />
      </Field>
      <Field label="Body">
        <VariableTextarea value={str(config.body_template)} onChange={(v) => patch({ body_template: v })} rows={3} />
      </Field>
    </div>
  )
}

function WebhookFields({
  config,
  patch,
}: {
  config: Record<string, unknown>
  patch: (p: Record<string, unknown>) => void
}) {
  const method = (str(config.method, "POST").toUpperCase() || "POST") as (typeof HTTP_METHODS)[number]
  const safeMethod = HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number]) ? method : "POST"
  const url = str(config.url)
  const bodyTmpl = str(config.body_template)
  const headersObj = record(config.headers)
  const headerRows = useMemo(() => objectToRows(headersObj), [config.headers])

  return (
    <div className="space-y-4">
      <Field label="Method">
        <select value={safeMethod} onChange={(e) => patch({ method: e.target.value })} className={selectClass}>
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m} className="bg-zinc-950">
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="URL">
        <VariableInput value={url} onChange={(v) => patch({ url: v })} placeholder="https://…" />
      </Field>
      {safeMethod !== "GET" && (
        <Field label="Body template">
          <VariableTextarea
            value={bodyTmpl}
            onChange={(v) => patch({ body_template: v })}
            rows={4}
            placeholder='{"key": "{{ meeting.id }}"}'
          />
        </Field>
      )}
      <Field label="Headers" hint={<span className="text-[10px] text-zinc-500">Sent with the request</span>}>
        <KeyValueEditor rows={headerRows} onChange={(rows) => patch({ headers: rowsToObject(rows) })} />
      </Field>
    </div>
  )
}

function ComposioFields({
  config,
  patch,
}: {
  config: Record<string, unknown>
  patch: (p: Record<string, unknown>) => void
}) {
  const args = record(config.arguments)
  const rows = useMemo(() => objectToRows(args), [config.arguments])

  return (
    <div className="space-y-4">
      <Field label="Action slug" hint={<span className="text-[10px] text-zinc-500">Composio tool identifier</span>}>
        <input
          value={str(config.slug)}
          onChange={(e) => patch({ slug: e.target.value })}
          placeholder="GMAIL_SEND_EMAIL"
          spellCheck={false}
          className={inputClass + " font-mono text-xs uppercase"}
        />
      </Field>
      <Field label="Arguments">
        <KeyValueEditor
          rows={rows}
          valuePlaceholder="value or drop a variable"
          valueAsVariable
          onChange={(next) => patch({ arguments: rowsToObject(next) })}
        />
      </Field>
    </div>
  )
}

/* ── Global CSS injected once ────────────────────────────────────────────── */
const VA_STYLES = `
.va-mirror {
  color: #e4e4e7;
  pointer-events: none;
  user-select: none;
}
.va-mirror mark.va-chip {
  background: #14532d;
  color: #6ee7b7;
  border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.35);
  font-style: normal;
}
.va-placeholder {
  color: #71717a;
}
`

function GlobalVaStyles() {
  return <style>{VA_STYLES}</style>
}

/* ── Public form ──────────────────────────────────────────────────────────── */
export function StepConfigForm({
  step,
  onChange,
}: {
  step: StepDraft
  onChange: (s: StepDraft) => void
}) {
  const api = useApi()
  const [modelCatalog, setModelCatalog] = useState<ChatModelOption[]>(FALLBACK_LLM_MODELS)

  useEffect(() => {
    let cancelled = false
    api
      .getRuleModelCatalog()
      .then((models) => {
        if (!cancelled && models.length > 0) setModelCatalog(models)
      })
      .catch(() => {
        if (!cancelled) setModelCatalog(FALLBACK_LLM_MODELS)
      })
    return () => {
      cancelled = true
    }
  }, [api])

  const setType = (step_type: RuleStepType) => {
    onChange({
      ...step,
      step_type,
      config: defaultConfig(step_type),
    })
  }

  const patchConfig = (partial: Record<string, unknown>) => {
    onChange({ ...step, config: { ...step.config, ...partial } })
  }

  const cfg = step.config

  const typeFields = (() => {
    switch (step.step_type) {
      case "llm_prompt":
        return <LlmFields config={cfg} patch={patchConfig} modelCatalog={modelCatalog} />
      case "send_email":
        return <EmailFields config={cfg} patch={patchConfig} />
      case "push_notification":
        return <PushFields config={cfg} patch={patchConfig} />
      case "webhook":
        return <WebhookFields config={cfg} patch={patchConfig} />
      case "composio_action":
        return <ComposioFields config={cfg} patch={patchConfig} />
      default:
        return null
    }
  })()

  return (
    <>
      <GlobalVaStyles />
      <div className="min-w-0 space-y-4 [color-scheme:dark]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Step type">
            <select
              value={step.step_type}
              onChange={(e) => setType(e.target.value as RuleStepType)}
              className={selectClass}
            >
              {STEP_TYPES.map((o) => (
                <option key={o.value} value={o.value} className="bg-zinc-950">
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Step name">
            <input
              value={step.name}
              onChange={(e) => onChange({ ...step, name: e.target.value })}
              className={inputClass}
              placeholder="e.g. Summarize transcript"
            />
          </Field>
        </div>
        <div key={step.id ?? "step-config"} className="border-t border-zinc-700/50 pt-4 space-y-4">
          {typeFields}
        </div>
      </div>
    </>
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
