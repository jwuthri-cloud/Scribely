import { Check, Minus, X } from "lucide-react"

type CellTone = "positive" | "neutral" | "negative"

export interface ComparisonColumn {
  id: string
  label: string
  subtitle?: string
  highlight?: boolean
}

export interface ComparisonCell {
  value: string
  detail?: string
  tone?: CellTone
}

export interface ComparisonRow {
  feature: string
  description?: string
  cells: ComparisonCell[]
}

interface BlogComparisonTableProps {
  columns: ComparisonColumn[]
  rows: ComparisonRow[]
  note?: string
}

function CellIcon({ value, tone }: { value: string; tone: CellTone }) {
  if (value === "Yes") {
    return <Check className="h-4 w-4 text-emerald-400" />
  }

  if (value === "No") {
    return <X className="h-4 w-4 text-rose-400/70" />
  }

  if (tone === "neutral") {
    return <Minus className="h-4 w-4 text-white/30" />
  }

  return null
}

export function BlogComparisonTable({
  columns,
  rows,
  note,
}: BlogComparisonTableProps) {
  return (
    <div className="my-10 space-y-4">
      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_0_60px_-30px_rgba(168,85,247,0.35)]">
        <table className="min-w-[980px] w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03]">
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                Feature
              </th>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={`px-5 py-4 text-sm ${
                    column.highlight
                      ? "bg-purple-500/[0.08] text-white"
                      : "text-white/70"
                  }`}
                >
                  <div className="font-semibold">{column.label}</div>
                  {column.subtitle ? (
                    <div className="mt-1 text-xs font-normal text-white/40">
                      {column.subtitle}
                    </div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={row.feature}
                className={
                  rowIndex < rows.length - 1 ? "border-b border-white/[0.06]" : ""
                }
              >
                <td className="px-5 py-4 align-top">
                  <div className="font-medium text-white">{row.feature}</div>
                  {row.description ? (
                    <p className="mt-1 text-xs leading-5 text-white/40">
                      {row.description}
                    </p>
                  ) : null}
                </td>
                {row.cells.map((cell, cellIndex) => {
                  const column = columns[cellIndex]
                  const tone = cell.tone ?? "neutral"

                  return (
                    <td
                      key={`${row.feature}-${column.id}`}
                      className={`px-5 py-4 align-top ${
                        column.highlight ? "bg-purple-500/[0.04]" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <CellIcon value={cell.value} tone={tone} />
                        <div>
                          <div
                            className={
                              tone === "positive"
                                ? "font-medium text-white"
                                : tone === "negative"
                                  ? "font-medium text-white/75"
                                  : "font-medium text-white/85"
                            }
                          >
                            {cell.value}
                          </div>
                          {cell.detail ? (
                            <p className="mt-1 text-xs leading-5 text-white/45">
                              {cell.detail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {note ? <p className="text-sm text-white/45">{note}</p> : null}
    </div>
  )
}
