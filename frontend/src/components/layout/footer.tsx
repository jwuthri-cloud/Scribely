"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Separator } from "@/components/ui/separator"
import { LocationMap } from "@/components/ui/expand-map"

const footerLinks = {
  Product: [
    { label: "Features", href: "/#features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Download", href: "/download" },
    { label: "Setup Guide", href: "/setup" },
    { label: "Changelog", href: "#" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "/contact" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-background">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
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
            <p className="text-sm text-white/40 max-w-xs">
              Your invisible AI meeting assistant. Live transcription and
              insights, all running locally on your Mac.
            </p>
            <div className="mt-8 pb-8">
              <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-white/30 mb-3">
                Headquarters
              </p>
              <LocationMap
                location="San Francisco, CA"
                coordinates="37.7749° N, 122.4194° W"
              />
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-white mb-4">
                {category}
              </h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/40 hover:text-white/70 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} Scribely. All rights reserved.
          </p>
          <p className="text-xs text-white/30">
            Made for professionals who live in meetings.
          </p>
        </div>
      </div>
    </footer>
  )
}
