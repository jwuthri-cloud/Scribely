"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Apple, Chrome, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

function AppMockup() {
  return (
    <div className="relative mx-auto max-w-4xl">
      <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 via-indigo-500/20 to-blue-500/20 rounded-2xl blur-xl" />
      <div className="relative rounded-xl border border-white/[0.08] bg-[#0c0c14] overflow-hidden shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-white/10" />
            <div className="w-3 h-3 rounded-full bg-white/10" />
            <div className="w-3 h-3 rounded-full bg-white/10" />
          </div>
          <div className="flex-1 text-center">
            <span className="text-xs text-white/30 font-medium">Scribely</span>
          </div>
        </div>

        <div className="flex min-h-[340px]">
          {/* Transcript panel */}
          <div className="w-1/2 border-r border-white/[0.06] p-4 space-y-3">
            <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">
              Live Transcript
            </div>
            {[
              { time: "0:12", speaker: "Sarah", text: "Let's review the Q3 performance numbers." },
              { time: "0:18", speaker: "Mark", text: "Sure, the numbers are looking good overall." },
              { time: "0:25", speaker: "Sarah", text: "What about the enterprise segment?" },
              { time: "0:31", speaker: "Mark", text: "We're seeing 40% growth in enterprise deals." },
              { time: "0:38", speaker: "Sarah", text: "That's great. What's the timeline for Q4?" },
              { time: "0:45", speaker: "Mark", text: "We're targeting end of November for the launch." },
            ].map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.15 }}
                className="flex gap-2 text-xs"
              >
                <span className="text-white/20 font-mono shrink-0 w-8">{entry.time}</span>
                <span className="text-purple-400/70 shrink-0 w-10">{entry.speaker}</span>
                <span className="text-white/50">{entry.text}</span>
              </motion.div>
            ))}
          </div>

          {/* AI Chat panel */}
          <div className="w-1/2 p-4 flex flex-col">
            <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">
              AI Chat
            </div>
            <div className="flex-1 space-y-3">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.6 }}
                className="ml-auto max-w-[80%] rounded-lg bg-gradient-to-r from-purple-600/40 to-indigo-600/40 border border-purple-500/20 px-3 py-2"
              >
                <p className="text-xs text-white/80">What are the key metrics mentioned?</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.0 }}
                className="max-w-[85%] rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2"
              >
                <p className="text-xs text-white/60">
                  Based on the discussion, the key metrics are:
                </p>
                <ul className="text-xs text-white/50 mt-1 space-y-0.5 list-disc list-inside">
                  <li>40% growth in enterprise deals</li>
                  <li>Q4 launch target: end of November</li>
                  <li>Positive Q3 performance</li>
                </ul>
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.4 }}
              className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
            >
              <span className="text-xs text-white/20">Ask about this meeting...</span>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-purple-600/20 rounded-full blur-[120px] animate-glow-pulse" />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-indigo-600/15 rounded-full blur-[100px] animate-glow-pulse [animation-delay:1s]" />
        <div className="absolute top-1/4 right-1/3 w-[300px] h-[300px] bg-blue-600/10 rounded-full blur-[80px] animate-glow-pulse [animation-delay:2s]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6"
        >
          <Badge>Now available for macOS</Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold tracking-tight mb-6"
        >
          Your Invisible AI{" "}
          <span className="text-gradient">Meeting Assistant</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10"
        >
          Live transcription, AI-powered Q&A, and real-time insights — all
          running locally on your Mac. Completely invisible to screen sharing.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
        >
          <Button size="xl" asChild>
            <Link href="/download">
              <Apple className="mr-2 h-5 w-5" />
              Download for Mac
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="xl" variant="secondary" asChild>
            <Link href="/download#chrome">
              <Chrome className="mr-2 h-5 w-5" />
              Get Chrome Extension
            </Link>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <AppMockup />
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  )
}
