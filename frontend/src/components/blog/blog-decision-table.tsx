import { Check, Minus } from "lucide-react"

interface DecisionRow {
  label: string
  cloud: string
  local: string
}

interface BlogDecisionTableProps {
  cloudLabel?: string
  localLabel?: string
  rows: DecisionRow[]
}

function DecisionCell({
  value,
  accent,
}: {
  value: string
  accent?: "cloud" | "local"
}) {
  const showCheck = value.startsWith("Best for")

  return (
    <div className="flex items-start gap-2">
      {showCheck ? (
        <Check
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            accent === "local" ? "text-cyan-400" : "text-purple-400"
          }`}
        />
      ) : (
        <Minus className="mt-0.5 h-4 w-4 shrink-0 text-white/25" />
      )}
      <span className="text-sm leading-6 text-white/75">{value}</span>
    </div>
  )
}

export function BlogDecisionTable({
  cloudLabel = "Cloud API",
  localLabel = "Local AI",
  rows,
}: BlogDecisionTableProps) {
  return (
    <div className="my-10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_0_60px_-30px_rgba(59,130,246,0.25)]">
      <div className="grid gap-px bg-white/10 md:grid-cols-[220px_1fr_1fr]">
        <div className="hidden bg-black/20 px-5 py-4 md:block" />
        <div className="bg-purple-500/[0.08] px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-200/80">
            Option A
          </div>
          <div className="mt-1 text-lg font-semibold text-white">{cloudLabel}</div>
        </div>
        <div className="bg-cyan-500/[0.08] px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
            Option B
          </div>
          <div className="mt-1 text-lg font-semibold text-white">{localLabel}</div>
        </div>

        {rows.map((row) => (
          <div key={row.label} className="contents">
            <div className="bg-black/20 px-5 py-4">
              <div className="text-sm font-medium text-white">{row.label}</div>
            </div>
            <div className="bg-black/20 px-5 py-4">
              <DecisionCell value={row.cloud} accent="cloud" />
            </div>
            <div className="bg-black/20 px-5 py-4">
              <DecisionCell value={row.local} accent="local" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
