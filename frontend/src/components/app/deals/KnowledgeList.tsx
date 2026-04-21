"use client"

import Link from "next/link"
import type { KnowledgeEntry } from "@/lib/api"

const categoryLabels: Record<string, string> = {
  role: "Role",
  preference: "Preference",
  pain_point: "Pain point",
  goal: "Goal",
  personal: "Personal",
  other: "Other",
}

const categoryColors: Record<string, string> = {
  role: "bg-sky-500/15 text-sky-300",
  preference: "bg-violet-500/15 text-violet-300",
  pain_point: "bg-rose-500/15 text-rose-300",
  goal: "bg-emerald-500/15 text-emerald-300",
  personal: "bg-amber-500/15 text-amber-300",
  other: "bg-white/10 text-white/60",
}

export function KnowledgeList({
  entries,
  showContact = false,
}: {
  entries: KnowledgeEntry[]
  showContact?: boolean
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-white/40">
        No knowledge extracted yet. Record a meeting to populate this section.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {entries.map((k) => (
        <li
          key={k.id}
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                categoryColors[k.category] ?? categoryColors.other
              }`}
            >
              {categoryLabels[k.category] ?? k.category}
            </span>
            {showContact && (k.contact_name || k.contact_email) ? (
              <Link
                href={`/contacts/${k.contact_id}`}
                className="text-xs text-white/55 hover:text-white"
              >
                {k.contact_name || k.contact_email}
              </Link>
            ) : null}
            {k.meeting_id ? (
              <Link
                href={`/meetings/${k.meeting_id}`}
                className="ml-auto text-[11px] text-white/30 hover:text-white/55"
              >
                {k.meeting_title?.trim() || "View meeting"}
                {k.meeting_recorded_at
                  ? ` · ${new Date(k.meeting_recorded_at).toLocaleDateString()}`
                  : ""}
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-white/85">{k.fact}</p>
          {k.source_snippet ? (
            <p className="mt-1.5 border-l-2 border-white/10 pl-2 text-xs italic text-white/40">
              “{k.source_snippet}”
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
