"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

type Variant = "user" | "assistant"

export function ChatMarkdown({
  content,
  variant,
}: {
  content: string
  variant: Variant
}) {
  const isUser = variant === "user"
  const link = isUser
    ? "text-white underline decoration-white/35 underline-offset-2 hover:decoration-white/70"
    : "text-cyan-300 underline decoration-cyan-500/40 underline-offset-2 hover:text-cyan-200"
  const inlineCode = isUser
    ? "rounded bg-white/20 px-1.5 py-0.5 font-mono text-[0.9em]"
    : "rounded bg-black/35 px-1.5 py-0.5 font-mono text-[0.9em] text-white/95"

  return (
    <div
      className={cn(
        "text-[14px] leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        isUser ? "text-white" : "text-white/90"
      )}
    >
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        h1: ({ children }) => (
          <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>
        ),
        h2: ({ children }) => (
          <h3 className="mb-2 mt-4 text-[15px] font-semibold first:mt-0">{children}</h3>
        ),
        h3: ({ children }) => (
          <h4 className="mb-2 mt-3 text-[15px] font-semibold first:mt-0">{children}</h4>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
        ),
        li: ({ children }) => <li className="[&>p]:mb-1 [&>p:last-child]:mb-0">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="mb-3 border-l-2 border-white/25 pl-3 text-white/80 last:mb-0">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} className={link} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        hr: () => <hr className="my-4 border-white/15" />,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        code: ({ className, children, ...props }) => {
          const isBlock = Boolean(className?.includes("language-"))
          if (isBlock) {
            return (
              <code
                className={cn(
                  "block whitespace-pre font-mono text-[13px] leading-relaxed text-white/90",
                  className
                )}
                {...props}
              >
                {children}
              </code>
            )
          }
          return (
            <code className={inlineCode} {...props}>
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="mb-3 overflow-x-auto rounded-xl border border-white/10 bg-black/45 p-3 last:mb-0 [&>code]:bg-transparent [&>code]:p-0">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto last:mb-0">
            <table className="w-full border-collapse text-left text-[13px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-white/15">{children}</thead>,
        th: ({ children }) => (
          <th className="px-2 py-1.5 font-semibold text-white">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border-t border-white/[0.08] px-2 py-1.5 text-white/85">{children}</td>
        ),
        tr: ({ children }) => <tr>{children}</tr>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  )
}
