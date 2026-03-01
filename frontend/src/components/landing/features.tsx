"use client"

import { motion } from "framer-motion"
import {
  Mic,
  MessageSquare,
  Sparkles,
  EyeOff,
  Shield,
  Chrome,
} from "lucide-react"

const features = [
  {
    icon: Mic,
    title: "Live Transcription",
    description:
      "Real-time, accurate transcription of your meetings with speaker identification. Powered by local Whisper models — no cloud needed.",
  },
  {
    icon: MessageSquare,
    title: "AI Chat",
    description:
      "Ask questions about your meeting in real-time. Use Ollama or LM Studio with Qwen3 for fully local, free AI — or OpenAI for best cloud-powered results.",
  },
  {
    icon: Sparkles,
    title: "Real-time Insights",
    description:
      "Automatic detection of questions, decisions, action items, and key topics as your meeting progresses.",
  },
  {
    icon: EyeOff,
    title: "Screen-share Invisible",
    description:
      "Completely hidden from screen sharing tools. Your AI assistant stays private — only you can see it.",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description:
      "Fully local when using Ollama or LM Studio with Qwen3 — transcription and AI run entirely on your Mac. No audio or transcript data ever leaves your device.",
  },
  {
    icon: Chrome,
    title: "Chrome Extension",
    description:
      "Seamlessly capture audio from Google Meet, Zoom, Teams, and any browser-based meeting with one click.",
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
}

export function Features() {
  return (
    <section id="features" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
            Everything you need in meetings
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            A complete AI toolkit that runs silently alongside your meetings,
            giving you superpowers without anyone knowing.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className="group relative rounded-xl glass glass-hover p-6"
            >
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/10">
                  <feature.icon className="h-5 w-5 text-purple-400" />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
