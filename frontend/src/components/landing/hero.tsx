"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Apple, Chrome, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

function AppMockup() {
  return (
    <div className="relative mx-auto max-w-md sm:max-w-lg">
      {/* Glow — uniform on all sides */}
      <div className="absolute -inset-6 rounded-3xl blur-2xl bg-purple-500/20" />

      <div className="relative rounded-2xl overflow-hidden shadow-[0_0_80px_-8px_rgba(168,85,247,0.35)]">
        <img
          src="/screenshots/app-main.png"
          alt="Scribely — Live transcription and AI chat during a meeting"
          className="w-full h-auto rounded-2xl"
          width={960}
          height={1700}
        />
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-16 pb-16 overflow-x-hidden">
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
          Live transcription, AI-powered Q&A, and real-time insights — works
          out of the box with OpenAI and Deepgram, or go fully local with Ollama or LM Studio. Completely invisible to screen sharing.
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

    </section>
  )
}
