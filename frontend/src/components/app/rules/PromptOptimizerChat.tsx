"use client"

import { useState } from "react"
import { Loader2, Sparkles, Send } from "lucide-react"
import { useApi } from "@/hooks/useApi"

export function PromptOptimizerChat({
  currentPrompt,
  onApply,
}: {
  currentPrompt: string
  onApply: (text: string) => void
}) {
  const api = useApi()
  const [msg, setMsg] = useState("")
  const [out, setOut] = useState("")
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    if (!msg.trim()) return
    setErr(null)
    setOut("")
    setLoading(true)
    try {
      let acc = ""
      await api.rulesPromptOptimizeStream(
        msg,
        (chunk) => {
          acc += chunk
          setOut(acc)
        },
        { current_prompt: currentPrompt || undefined }
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white/90">
        <Sparkles className="h-4 w-4 text-amber-400/80" />
        Prompt optimizer
      </div>
      <p className="mb-3 text-xs text-white/45">
        Describe how you want your LLM step prompt to behave. The model returns an improved template you can paste
        into the step config.
      </p>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={3}
        placeholder="e.g. Make the summary focus on action items and owners…"
        className="mb-2 w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || !msg.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-white/[0.08] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.12] disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Improve
        </button>
        {out && (
          <button
            type="button"
            onClick={() => onApply(out)}
            className="rounded-lg border border-emerald-500/30 px-4 py-2 text-sm text-emerald-300/90 hover:bg-emerald-500/10"
          >
            Use as user_prompt_template
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-400/90">{err}</p>}
      {out && (
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-white/[0.06] bg-black/40 p-3 font-mono text-xs text-white/80 whitespace-pre-wrap">
          {out}
        </pre>
      )}
    </div>
  )
}
