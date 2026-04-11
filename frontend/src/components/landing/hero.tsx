"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { motion } from "framer-motion"
import { Apple, Chrome, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RotatingText } from "@/components/ui/rotating-text"
import {
  PulseBeams,
  defaultPulseBeams,
  defaultPulseBeamsGradient,
} from "@/components/ui/pulse-beams"

const InteractiveDemo = dynamic(
  () =>
    import("@/components/landing/demo/interactive-demo").then(
      (m) => m.InteractiveDemo
    ),
  { ssr: false }
)

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-16 pb-16 overflow-x-hidden">
      <PulseBeams
        fillContainer
        beams={defaultPulseBeams}
        gradientColors={defaultPulseBeamsGradient}
        baseColor="rgba(148, 163, 184, 0.12)"
        accentColor="rgba(168, 85, 247, 0.22)"
        className="opacity-[0.85]"
      />

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
          <RotatingText
            words={[
              "Meeting Assistant",
              "Transcription Assistant",
              "Q&A Assistant",
              "Insights Engine",
            ]}
            mode="slide"
            interval={3000}
            className="text-gradient"
          />
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
          <InteractiveDemo />
        </motion.div>
      </div>

    </section>
  )
}
