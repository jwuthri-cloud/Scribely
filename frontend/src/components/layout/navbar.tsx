"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { Menu, X, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/download", label: "Download" },
  { href: "/setup", label: "Setup Guide" },
  { href: "/about", label: "About" },
]

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-white/[0.06]"
          : "bg-transparent"
      )}
    >
      <nav className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <motion.img
              src="/scribely-icon.png"
              alt="Scribely"
              className="h-8 w-8 rounded-lg object-contain"
              width={32}
              height={32}
              animate={{ scale: [1, 1.08, 1] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              whileHover={{ scale: 1 }}
            />
            <span className="text-lg font-display font-bold text-white">
              Scribely
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-4 py-2 text-sm rounded-lg transition-colors",
                  pathname === link.href
                    ? "text-white bg-white/[0.06]"
                    : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button size="sm" asChild>
              <Link href="/download">
                <Download className="mr-2 h-4 w-4" />
                Download
              </Link>
            </Button>
          </div>

          <button
            className="md:hidden p-2 text-white/60 hover:text-white"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-label="Toggle menu"
          >
            {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {isMobileOpen && (
          <div className="md:hidden pb-4 border-t border-white/[0.06] mt-2 pt-4">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-4 py-3 text-sm rounded-lg transition-colors",
                    pathname === link.href
                      ? "text-white bg-white/[0.06]"
                      : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-3 px-4">
                <Button className="w-full" size="sm" asChild>
                  <Link href="/download">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
