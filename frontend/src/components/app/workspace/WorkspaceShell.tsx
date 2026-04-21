"use client"

import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import {
  Briefcase,
  ChevronLeft,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Users,
  Video,
  X,
  CalendarDays,
  Workflow,
} from "lucide-react"
import { clerkAdditionalGoogleCalendarScopes } from "@/lib/clerk-google-calendar"
import { cn } from "@/lib/utils"
import { CommandPalette } from "@/components/app/workspace/CommandPalette"
import { CursorGridEffect } from "@/components/app/workspace/CursorGridEffect"

const sidebarLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/deals", label: "Deals", icon: Briefcase },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/rules", label: "Rules", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
] as const

const STORAGE_KEY = "scribely.workspace.sidebar"

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === "collapsed") setCollapsed(true)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded")
  }, [collapsed])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault()
      setCmdOpen((v) => !v)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const isChatRoute =
    pathname === "/chat" || pathname.startsWith("/chat/")

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden bg-black">
      <CursorGridEffect />
      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/[0.06] bg-[#0a0a0f] transition-[width,transform] duration-300",
          collapsed ? "w-[4.5rem]" : "w-[16rem]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className={cn("flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4", collapsed && "justify-center px-0")}>
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <Image
              src="/scribely-icon.png"
              alt="Scribely"
              width={26}
              height={26}
              className="rounded-md object-contain"
            />
            {!collapsed && (
              <span className="text-[15px] font-semibold tracking-tight text-white">
                Scribely
              </span>
            )}
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          <ul className="space-y-0.5">
            {sidebarLinks.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      isActive
                        ? "bg-white/[0.08] text-white"
                        : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <link.icon className="h-[17px] w-[17px] shrink-0" />
                    {!collapsed && <span>{link.label}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Bottom: collapse toggle */}
        <div className="border-t border-white/[0.06] p-2.5">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden w-full items-center justify-center rounded-lg py-2 text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/60 md:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-300",
          collapsed ? "md:pl-[4.5rem]" : "md:pl-[16rem]"
        )}
      >
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] bg-black/70 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="hidden h-8 items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-xs text-white/35 transition-colors hover:border-white/[0.1] hover:text-white/55 sm:inline-flex"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
              <kbd className="ml-3 rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/25">
                ⌘K
              </kbd>
            </button>
            <UserButton
              afterSignOutUrl="/"
              userProfileProps={{
                additionalOAuthScopes: clerkAdditionalGoogleCalendarScopes,
              }}
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
          </div>
        </header>

        <main
          className={cn(
            "app-workspace-canvas flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] px-4 sm:px-6 lg:px-8",
            isChatRoute
              ? "pt-5 pb-0 lg:pt-8 lg:pb-0"
              : "py-5 lg:py-8"
          )}
        >
          {children}
        </main>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  )
}
