"use client"

import { Component, useMemo, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import rehypeHighlight from "rehype-highlight"
import { ChevronDown, ChevronRight } from "lucide-react"

type Shape =
  | "null"
  | "boolean"
  | "number"
  | "html"
  | "markdown"
  | "url"
  | "text"
  | "array-primitive"
  | "array-object"
  | "object"
  | "other"

const HTML_RE = /^\s*<[a-z!][\s\S]*>/i
const URL_RE = /^(https?:\/\/|www\.)\S+$/i
const MARKDOWN_RE = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)|(\*\*|__|`[^`]+`|\[[^\]]+\]\([^)]+\))/

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function detectShape(v: unknown, hint?: string): Shape {
  if (v === null || v === undefined) return "null"
  if (typeof v === "boolean") return "boolean"
  if (typeof v === "number") return "number"
  if (typeof v === "string") {
    const s = v.trim()
    if (!s) return "text"
    if (URL_RE.test(s)) return "url"
    if (HTML_RE.test(s)) return "html"
    const biasText = hint === "push_notification"
    if (!biasText && MARKDOWN_RE.test(s)) return "markdown"
    return "text"
  }
  if (Array.isArray(v)) {
    const hasObject = v.some((x) => isPlainObject(x) || Array.isArray(x))
    return hasObject ? "array-object" : "array-primitive"
  }
  if (isPlainObject(v)) return "object"
  return "other"
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

const markdownComponents = {
  a: ({ href, children, ...rest }: { href?: string; children?: ReactNode }) => (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-300 underline decoration-indigo-400/40 underline-offset-2 hover:decoration-indigo-300"
    >
      {children}
    </a>
  ),
}

export function JsonCodeBlock({ value, className }: { value: unknown; className?: string }) {
  const md = useMemo(() => "```json\n" + safeStringify(value) + "\n```", [value])
  return (
    <div
      className={
        "overflow-x-auto rounded-md border border-white/[0.06] bg-black/40 text-[12px] leading-relaxed " +
        "[&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-3 [&_code]:!bg-transparent [&_code]:font-mono " +
        (className ?? "")
      }
    >
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{md}</ReactMarkdown>
    </div>
  )
}

function MarkdownView({ source, allowHtml }: { source: string; allowHtml: boolean }) {
  const rehypePlugins = allowHtml
    ? [rehypeRaw, rehypeSanitize, rehypeHighlight]
    : [rehypeHighlight]
  return (
    <div
      className={
        "prose prose-invert prose-sm max-w-none " +
        "prose-headings:mt-2 prose-headings:mb-2 prose-headings:text-white/90 " +
        "prose-p:my-1.5 prose-p:text-white/85 " +
        "prose-strong:text-white prose-em:text-white/85 " +
        "prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5 " +
        "prose-code:text-emerald-200 prose-code:bg-white/[0.06] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-[''] prose-code:after:content-[''] " +
        "prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/[0.06] prose-pre:rounded-md " +
        "prose-blockquote:text-white/70 prose-blockquote:border-white/20 " +
        "prose-hr:border-white/10"
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "true" | "false" | "number"
}) {
  const cls =
    tone === "true"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/20"
      : tone === "false"
      ? "bg-red-500/10 text-red-300 border-red-400/20"
      : tone === "number"
      ? "bg-indigo-500/10 text-indigo-200 border-indigo-400/20"
      : "bg-white/[0.06] text-white/70 border-white/10"
  return (
    <span
      className={
        "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] " + cls
      }
    >
      {children}
    </span>
  )
}

function humanizeKey(k: string): string {
  return k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function ObjectView({
  value,
  hint,
  depth,
}: {
  value: Record<string, unknown>
  hint?: string
  depth: number
}) {
  const entries = Object.entries(value)
  const LARGE = 20
  const [expanded, setExpanded] = useState(entries.length <= LARGE)

  if (entries.length === 0) {
    return <span className="text-xs italic text-white/40">empty object</span>
  }

  const shown = expanded ? entries : entries.slice(0, LARGE)

  return (
    <div className="overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.015]">
      <dl className="divide-y divide-white/[0.05]">
        {shown.map(([k, v]) => (
          <div
            key={k}
            className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[minmax(120px,180px)_1fr] sm:gap-3"
          >
            <dt className="pt-0.5 font-mono text-[10.5px] uppercase tracking-wide text-white/45">
              {humanizeKey(k)}
            </dt>
            <dd className="min-w-0 text-[13px] text-white/85">
              <RuleStepResult value={v} stepType={hint} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
      {entries.length > LARGE ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center justify-center gap-1 border-t border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.04] hover:text-white/80"
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3 w-3" /> Collapse ({entries.length} keys)
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" /> Show all {entries.length} keys
            </>
          )}
        </button>
      ) : null}
    </div>
  )
}

function ArrayPrimitiveView({ value }: { value: unknown[] }) {
  if (value.length === 0) {
    return <span className="text-xs italic text-white/40">empty list</span>
  }
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-white/85 marker:text-white/30">
      {value.map((item, i) => (
        <li key={i} className="min-w-0">
          <RuleStepResult value={item} depth={1} />
        </li>
      ))}
    </ul>
  )
}

function ArrayObjectView({
  value,
  hint,
  depth,
}: {
  value: unknown[]
  hint?: string
  depth: number
}) {
  if (value.length === 0) {
    return <span className="text-xs italic text-white/40">empty list</span>
  }
  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="relative">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-white/35">
            #{i + 1}
          </div>
          <RuleStepResult value={item} stepType={hint} depth={depth + 1} />
        </div>
      ))}
    </div>
  )
}

class ResultErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch() {
    // swallow; fallback already renders raw JSON
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

export interface RuleStepResultProps {
  value: unknown
  stepType?: string
  depth?: number
}

export function RuleStepResult({ value, stepType, depth = 0 }: RuleStepResultProps) {
  const shape = detectShape(value, stepType)
  const fallback = <JsonCodeBlock value={value} />

  let node: ReactNode
  switch (shape) {
    case "null":
      node = <span className="text-white/40">—</span>
      break
    case "boolean":
      node = <Pill tone={value ? "true" : "false"}>{String(value)}</Pill>
      break
    case "number":
      node = <Pill tone="number">{String(value)}</Pill>
      break
    case "url": {
      const href = value as string
      node = (
        <a
          href={href.startsWith("http") ? href : `https://${href}`}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-indigo-300 underline decoration-indigo-400/40 underline-offset-2 hover:decoration-indigo-300"
        >
          {href}
        </a>
      )
      break
    }
    case "html":
      node = <MarkdownView source={value as string} allowHtml />
      break
    case "markdown":
      node = <MarkdownView source={value as string} allowHtml={false} />
      break
    case "text":
      node = (
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/85">
          {value as string}
        </p>
      )
      break
    case "array-primitive":
      node = <ArrayPrimitiveView value={value as unknown[]} />
      break
    case "array-object":
      node = <ArrayObjectView value={value as unknown[]} hint={stepType} depth={depth} />
      break
    case "object":
      node = (
        <ObjectView
          value={value as Record<string, unknown>}
          hint={stepType}
          depth={depth}
        />
      )
      break
    default:
      node = fallback
  }

  return <ResultErrorBoundary fallback={fallback}>{node}</ResultErrorBoundary>
}
