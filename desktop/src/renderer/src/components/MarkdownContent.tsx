import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

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
              backgroundColor: 'color-mix(in srgb, var(--border) 40%, transparent)',
              fontFamily: 'ui-monospace, monospace',
            }}
            {...props}
          >
            {children}
          </code>
        )
      }
      return (
        <code
          className="block p-2 rounded-lg text-[12px] overflow-x-auto my-1.5"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--border) 30%, transparent)',
            border: '1px solid var(--border)',
            fontFamily: 'ui-monospace, monospace',
          }}
          {...props}
        >
          {children}
        </code>
      )
    },
    pre: ({ children }) => (
      <pre className="my-1.5 overflow-x-auto">{children}</pre>
    ),
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
