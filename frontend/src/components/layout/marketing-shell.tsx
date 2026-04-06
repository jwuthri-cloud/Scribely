"use client"

import { usePathname } from "next/navigation"
import { Navbar } from "@/components/layout/navbar"
import { Footer } from "@/components/layout/footer"

const HIDE_MARKETING_PREFIXES = [
  "/dashboard",
  "/meetings",
  "/calendar",
  "/chat",
  "/settings",
  "/sign-in",
  "/sign-up",
]

function shouldHideMarketingChrome(pathname: string): boolean {
  return HIDE_MARKETING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Renders the marketing Navbar + Footer only on public marketing pages.
 * App routes (dashboard, meetings, chat, settings) and Clerk auth pages
 * use their own chrome — avoids duplicate headers and overlapping UserButtons.
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hide = shouldHideMarketingChrome(pathname)

  if (hide) {
    return <>{children}</>
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen">{children}</main>
      <Footer />
    </>
  )
}
