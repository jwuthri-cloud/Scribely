"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  Video,
} from "lucide-react"

const pages = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: "home overview stats" },
  { href: "/meetings", label: "Meetings", icon: Video, keywords: "recordings transcripts calls" },
  { href: "/chat", label: "Chat", icon: MessageSquare, keywords: "ai ask question assistant" },
  { href: "/settings", label: "Settings", icon: Settings, keywords: "account profile preferences" },
]

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!open) setSearch("")
  }, [open])

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
        onKeyDown={(e) => { if (e.key === "Escape") onOpenChange(false) }}
        role="button"
        tabIndex={-1}
        aria-label="Close command palette"
      />
      <div className="fixed inset-0 z-[101] flex items-start justify-center px-4 pt-[20vh]">
        <Command
          className="w-full max-w-[520px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#141418] shadow-2xl shadow-black/60"
          shouldFilter
          loop
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false) }}
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
              placeholder="Type a command or search…"
              className="h-12 flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
            />
            <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/25">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[320px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-8 text-center text-sm text-white/30">
              No results found.
            </Command.Empty>

            <Command.Group
              heading="Navigate"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-white/25"
            >
              {pages.map((page) => (
                <Command.Item
                  key={page.href}
                  value={`${page.label} ${page.keywords}`}
                  onSelect={() => navigate(page.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-white"
                >
                  <page.icon className="h-4 w-4 shrink-0" />
                  <span>{page.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </>
  )
}
