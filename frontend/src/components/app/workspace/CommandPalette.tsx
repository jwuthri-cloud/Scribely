"use client"

import type { KeyboardEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import {
  CalendarDays,
  FilePlus,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Settings,
  Video,
  Workflow,
} from "lucide-react"
import { useApi } from "@/hooks/useApi"
import type { MeetingRule, MeetingSummary } from "@/lib/api"

const navPages = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: "home overview stats" },
  { href: "/meetings", label: "Meetings", icon: Video, keywords: "recordings transcripts calls list" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, keywords: "schedule google upcoming events" },
  { href: "/chat", label: "Chat", icon: MessageSquare, keywords: "ai ask question assistant" },
  { href: "/rules", label: "Rules", icon: Workflow, keywords: "automation workflow triggers" },
  { href: "/settings", label: "Settings", icon: Settings, keywords: "account profile preferences" },
] as const

const quickActions = [
  { href: "/rules/new", label: "Create rule", icon: FilePlus, keywords: "new automation workflow" },
] as const

function formatMeetingWhen(recordedAt: string | null, createdAt: string) {
  const d = recordedAt ? new Date(recordedAt) : new Date(createdAt)
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function matchesQuery(q: string, ...parts: (string | null | undefined)[]) {
  if (!q) return true
  const blob = parts.filter(Boolean).join(" ").toLowerCase()
  return blob.includes(q)
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const api = useApi()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [recentMeetings, setRecentMeetings] = useState<MeetingSummary[]>([])
  const [rules, setRules] = useState<MeetingRule[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [meetingSearchLoading, setMeetingSearchLoading] = useState(false)
  const [meetingSearchResults, setMeetingSearchResults] = useState<MeetingSummary[] | null>(null)
  const searchGen = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 280)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!open) {
      setSearch("")
      setDebouncedSearch("")
      setRecentMeetings([])
      setRules([])
      setMeetingSearchResults(null)
      return
    }

    let cancelled = false
    setListLoading(true)
    ;(async () => {
      try {
        const [meetingsRes, rulesRes] = await Promise.all([
          api.getMeetings({ page: 1, limit: 35 }),
          api.listRules(),
        ])
        if (!cancelled) {
          setRecentMeetings(meetingsRes.meetings)
          setRules(rulesRes)
        }
      } catch {
        if (!cancelled) {
          setRecentMeetings([])
          setRules([])
        }
      } finally {
        if (!cancelled) setListLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, api])

  useEffect(() => {
    if (!open || debouncedSearch.length < 2) {
      setMeetingSearchResults(null)
      setMeetingSearchLoading(false)
      return
    }

    const gen = ++searchGen.current
    setMeetingSearchLoading(true)

    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getMeetings({ search: debouncedSearch, limit: 25, page: 1 })
        if (cancelled || gen !== searchGen.current) return
        setMeetingSearchResults(data.meetings)
      } catch {
        if (cancelled || gen !== searchGen.current) return
        setMeetingSearchResults([])
      } finally {
        if (!cancelled && gen === searchGen.current) setMeetingSearchLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, debouncedSearch, api])

  const q = search.trim().toLowerCase()

  const filteredNav = useMemo(
    () => navPages.filter((p) => matchesQuery(q, p.label, p.keywords)),
    [q]
  )

  const filteredQuick = useMemo(
    () => quickActions.filter((a) => matchesQuery(q, a.label, a.keywords)),
    [q]
  )

  const meetingsShown = useMemo(() => {
    if (debouncedSearch.length >= 2) {
      return meetingSearchResults ?? []
    }
    return recentMeetings.filter((m) =>
      matchesQuery(q, m.title ?? "", m.id, m.status)
    )
  }, [debouncedSearch.length, meetingSearchResults, recentMeetings, q])

  const filteredRules = useMemo(
    () =>
      rules.filter((r) =>
        matchesQuery(q, r.name, r.description, r.trigger, r.enabled ? "enabled" : "disabled")
      ),
    [rules, q]
  )

  const showMeetingSearchSpinner =
    debouncedSearch.length >= 2 && meetingSearchLoading

  const meetingSearchEmpty =
    debouncedSearch.length >= 2 &&
    !meetingSearchLoading &&
    meetingSearchResults !== null &&
    meetingSearchResults.length === 0

  const showMeetingsSection =
    !listLoading &&
    (showMeetingSearchSpinner ||
      meetingsShown.length > 0 ||
      meetingSearchEmpty)

  const hasResults =
    filteredNav.length +
      filteredQuick.length +
      (showMeetingsSection ? 1 : 0) +
      filteredRules.length >
    0

  const navigate = useCallback(
    (href: string) => {
      onOpenChange(false)
      router.push(href)
    },
    [onOpenChange, router]
  )

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false)
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close command palette"
      />
      <div className="fixed inset-0 z-[101] flex items-start justify-center px-4 pt-[20vh]">
        <Command
          shouldFilter={false}
          className="w-full max-w-[520px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#141418] shadow-2xl shadow-black/60"
          loop
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Escape") onOpenChange(false)
          }}
        >
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4">
            <svg
              className="h-4 w-4 shrink-0 text-white/30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search pages, meetings, and rules…"
              className="h-12 flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
            />
            <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/25">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[min(420px,55vh)] overflow-y-auto p-2">
            {!hasResults && !listLoading ? (
              <Command.Empty className="px-4 py-8 text-center text-sm text-white/30">
                No results found.
              </Command.Empty>
            ) : null}

            {listLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-white/35">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : null}

            {filteredNav.length > 0 ? (
              <Command.Group
                heading="Go to"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-white/25"
              >
                {filteredNav.map((page) => (
                  <Command.Item
                    key={page.href}
                    value={`nav-${page.href}`}
                    keywords={[page.label, page.keywords]}
                    onSelect={() => navigate(page.href)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-white"
                  >
                    <page.icon className="h-4 w-4 shrink-0" />
                    <span>{page.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {filteredQuick.length > 0 ? (
              <Command.Group
                heading="Quick actions"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-white/25"
              >
                {filteredQuick.map((action) => (
                  <Command.Item
                    key={action.href}
                    value={`action-${action.href}`}
                    keywords={[action.label, action.keywords]}
                    onSelect={() => navigate(action.href)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-white"
                  >
                    <action.icon className="h-4 w-4 shrink-0" />
                    <span>{action.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {showMeetingsSection ? (
              <Command.Group
                heading={
                  debouncedSearch.length >= 2 ? "Meetings (search)" : "Recent meetings"
                }
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-white/25"
              >
                {showMeetingSearchSpinner ? (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white/40">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    Searching meetings…
                  </div>
                ) : null}
                {meetingSearchEmpty ? (
                  <div className="px-3 py-2.5 text-sm text-white/30">No meetings match your search.</div>
                ) : null}
                {meetingsShown.map((m) => (
                  <Command.Item
                    key={m.id}
                    value={`meeting-${m.id}`}
                    keywords={[m.title ?? "", m.status, m.id]}
                    onSelect={() => navigate(`/meetings/${m.id}`)}
                    className="flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm data-[selected=true]:bg-white/[0.06]"
                  >
                    <span className="text-white/75">
                      {m.title?.trim() || "Untitled meeting"}
                    </span>
                    <span className="text-[11px] text-white/35">
                      {formatMeetingWhen(m.recorded_at, m.created_at)}
                      {m.status ? ` · ${m.status}` : ""}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {filteredRules.length > 0 && !listLoading ? (
              <Command.Group
                heading="Rules"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-white/25"
              >
                {filteredRules.map((r) => (
                  <Command.Item
                    key={r.id}
                    value={`rule-${r.id}`}
                    keywords={[r.name, r.description ?? "", r.trigger]}
                    onSelect={() => navigate(`/rules/${r.id}`)}
                    className="flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm data-[selected=true]:bg-white/[0.06]"
                  >
                    <span className="text-white/75">{r.name}</span>
                    <span className="text-[11px] capitalize text-white/35">{r.trigger.replace(/_/g, " ")}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </div>
    </>
  )
}
