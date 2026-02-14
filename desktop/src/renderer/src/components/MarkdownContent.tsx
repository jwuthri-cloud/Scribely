import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { monokai } from 'react-syntax-highlighter/dist/esm/styles/hljs'

/** Monokai-inspired palette for inline code */
const INLINE_CODE_BG = '#3e3d32'
const INLINE_CODE_TEXT = '#f8f8f2'

function CodeBlockWithCopy({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await window.electronAPI?.clipboardWriteText?.(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="relative my-1.5">
      <button
        onClick={copy}
        className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium opacity-60 hover:opacity-100 transition-opacity z-10"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--surface) 90%, transparent)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border)',
        }}
        title="Copy code"
        aria-label="Copy code"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <SyntaxHighlighter
        language={lang}
        style={monokai}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: '0.5rem 0.75rem',
          paddingRight: '3rem',
          borderRadius: '0.5rem',
          fontSize: '12px',
        }}
        codeTagProps={{ style: { fontFamily: 'ui-monospace, monospace' } }}
        showLineNumbers={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

interface MarkdownContentProps {
  content: string
  className?: string
  /** Text color for the content */
  color?: string
}

/** Renders markdown with proper styling. Links open in external browser. */
export function MarkdownContent({
  content,
  className = '',
  color = 'var(--text)',
}: MarkdownContentProps) {
  const components: Components = {
    a: ({ href, children }) => {
      if (!href) return <>{children}</>
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault()
            if (href.startsWith('http://') || href.startsWith('https://')) {
              window.electronAPI?.openExternalUrl?.(href)
            }
          }}
          className="underline hover:opacity-80 transition-opacity"
          style={{ color: 'var(--accent)' }}
        >
          {children}
        </a>
      )
    },
    p: ({ children }) => (
      <p className="mb-2 last:mb-0">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="ml-2">{children}</li>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }) => (
      <em>{children}</em>
    ),
    code: ({ className, children, ...props }) => {
      const isInline = !className
      if (isInline) {
        return (
          <code
            className="px-1 py-0.5 rounded text-[12px]"
            style={{
              backgroundColor: INLINE_CODE_BG,
              color: INLINE_CODE_TEXT,
              fontFamily: 'ui-monospace, monospace',
            }}
            {...props}
          >
            {children}
          </code>
        )
      }
      const match = className?.match(/language-(\w+)/)
      const lang = match ? match[1] : 'text'
      return (
        <CodeBlockWithCopy code={String(children)} lang={lang} />
      )
    },
    pre: ({ children }) => <>{children}</>,
    h1: ({ children }) => (
      <h1 className="text-base font-semibold mt-3 mb-1 first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-sm font-medium mt-2 mb-0.5 first:mt-0">{children}</h3>
    ),
    blockquote: ({ children }) => (
      <blockquote
        className="border-l-2 pl-2 my-1.5 italic"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr className="my-2" style={{ borderColor: 'var(--border)' }} />
    ),
  }

  return (
    <div
      className={`markdown-content ${className}`}
      style={{ color }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
