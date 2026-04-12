"use client"

import { usePathname } from "next/navigation"
import { Navbar } from "@/components/layout/navbar"
import { Footer } from "@/components/layout/footer"
import { shouldHideMarketingChrome } from "@/lib/marketing-chrome"

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
      {/* Avoid min-h-screen here: it forces a full-viewport-tall main on sparse pages (e.g. contact
          success), leaving a huge empty band above the footer. Section-level min-h (hero, etc.) handles full-bleed layouts. */}
      <main className="w-full">{children}</main>
      <Footer />
    </>
  )
}
