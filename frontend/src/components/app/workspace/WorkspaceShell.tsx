"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import Image from "next/image"
import {
  ChevronLeft,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Settings,
  Video,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

const sidebarLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, orbit: "top-6 left-1/2 -translate-x-1/2" },
  { href: "/meetings", label: "Meetings", icon: Video, orbit: "top-1/2 right-5 -translate-y-1/2" },
  { href: "/chat", label: "Chat", icon: MessageSquare, orbit: "bottom-6 left-1/2 -translate-x-1/2" },
  { href: "/settings", label: "Settings", icon: Settings, orbit: "top-1/2 left-5 -translate-y-1/2" },
] as const

const STORAGE_KEY = "scribely.workspace.sidebar"

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === "collapsed") {
      setCollapsed(true)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded")
  }, [collapsed])

  const activeLabel = useMemo(() => {
    const active = sidebarLinks.find(
      (link) => pathname === link.href || pathname.startsWith(`${link.href}/`)
    )
    return active?.label ?? "Workspace"
  }, [pathname])

  return (
    <div className="flex min-h-screen bg-black">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu overlay"
        />
      ) : null}

      <aside
        className={cn(
          "app-sidebar-surface fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/10 transition-[width,transform] duration-300",
          collapsed ? "w-[5.5rem]" : "w-[18.5rem]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="border-b border-white/10 px-4 py-4">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <Link
              href="/dashboard"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_18px_38px_-28px_rgba(99,102,241,0.95)]"
            >
              <Image
                src="/scribely-icon.png"
                alt="Scribely"
                width={28}
                height={28}
                className="rounded-md object-contain"
              />
            </Link>

            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.34em] text-white/40">Scribely</p>
                <p className="truncate font-display text-xl font-semibold tracking-[-0.04em] text-white">
                  Workspace
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <nav>
            <ul className="space-y-2">
              {sidebarLinks.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "workspace-nav-item",
                        collapsed && "justify-center px-3",
                        isActive && "app-nav-active"
                      )}
                      data-active={isActive}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <link.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed ? <span>{link.label}</span> : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {!collapsed ? (
            <div className="workspace-panel workspace-nav-orbit mt-6 px-4 py-5">
              <div className="relative mx-auto h-40 w-40">
                <div className="absolute inset-[2.2rem] rounded-full border border-white/10 bg-white/[0.03]" />
                <div className="absolute inset-[4.1rem] rounded-full border border-cyan-300/20 bg-cyan-300/10" />
                <div className="absolute inset-0 animate-[spin_18s_linear_infinite] motion-reduce:animate-none">
                  {sidebarLinks.map((link) => {
                    const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
                    return (
                      <div key={link.href} className={cn("absolute", link.orbit)}>
                        <Link
                          href={link.href}
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/65 backdrop-blur-sm transition-colors hover:text-white",
                            isActive && "border-cyan-300/40 bg-cyan-300/15 text-white"
                          )}
                          aria-label={link.label}
                        >
                          <link.icon className="h-4 w-4" />
                        </Link>
                      </div>
                    )
                  })}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full border border-white/10 bg-black/60 px-3 py-2 text-center shadow-lg">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-white/35">Open</p>
                    <p className="mt-1 text-sm font-medium text-white">{activeLabel}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="hidden h-11 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/58 transition-colors hover:bg-white/[0.08] hover:text-white md:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>
      </aside>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[padding] duration-300",
          collapsed ? "md:pl-[5.5rem]" : "md:pl-[18.5rem]"
        )}
      >
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[rgba(5,7,18,0.82)] backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/35">
                  Authenticated app
                </p>
                <p className="truncate text-sm font-medium text-white/75">{activeLabel}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="hidden rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/55 transition-colors hover:text-white sm:inline-flex"
              >
                Marketing site
              </Link>
              <UserButton
                afterSignOutUrl="/"
                appearance={{ elements: { avatarBox: "h-9 w-9 ring-2 ring-cyan-300/20" } }}
              />
            </div>
          </div>
        </header>

        <main className="app-workspace-canvas flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
