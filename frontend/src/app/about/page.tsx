"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  Mic,
  Brain,
  EyeOff,
  Zap,
  ArrowRight,
  ArrowDown,
  Lock,
  Wifi,
  WifiOff,
  Monitor,
  Briefcase,
  Users,
  GraduationCap,
  Headphones,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

// export metadata from a separate file since this is now a client component
// SEO metadata is set via generateMetadata in the layout or via head.tsx

const stats = [
  { value: "Cloud or local", label: "Your choice" },
  { value: "<1min", label: "Setup time" },
  { value: "∞", label: "Free meetings" },
  { value: "0 install", label: "With cloud APIs" },
]

const pipeline = [
  {
    icon: Mic,
    title: "Capture",
    detail: "Chrome extension, system audio, or mic",
    color: "from-purple-500/30 to-purple-600/30",
    iconColor: "text-purple-400",
  },
  {
    icon: Brain,
    title: "Transcribe",
    detail: "Local Whisper or cloud (Deepgram, Rev.ai)",
    color: "from-indigo-500/30 to-indigo-600/30",
    iconColor: "text-indigo-400",
  },
  {
    icon: Zap,
    title: "Analyze",
    detail: "Real-time insights & AI chat (OpenAI, Ollama, or LM Studio)",
    color: "from-blue-500/30 to-blue-600/30",
    iconColor: "text-blue-400",
  },
  {
    icon: EyeOff,
    title: "Display",
    detail: "Invisible overlay only you see",
    color: "from-cyan-500/30 to-cyan-600/30",
    iconColor: "text-cyan-400",
  },
]

const useCases = [
  {
    icon: Briefcase,
    title: "Sales",
    description: "Track commitments and key points during client calls without anyone knowing.",
  },
  {
    icon: Users,
    title: "Team Syncs",
    description: "Auto-capture action items and decisions. Focus on the conversation.",
  },
  {
    icon: GraduationCap,
    title: "Research",
    description: "Perfect records of user interviews and research sessions, hands-free.",
  },
  {
    icon: Headphones,
    title: "Remote Work",
    description: "Works with every video platform. Private even during screen shares.",
  },
]

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1 },
  }),
}

export default function AboutPage() {
  return (
    <div className="pt-32 pb-16">
      {/* Hero — big statement */}
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8 mb-32">
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-purple-600/[0.08] rounded-full blur-[120px]" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative text-center max-w-4xl mx-auto"
        >
          <Badge className="mb-6">Our Story</Badge>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold text-white mb-8 leading-[1.1]">
            We believe meetings
            <br />
            should work{" "}
            <span className="text-gradient">for you</span>
          </h1>
          <p className="text-xl text-white/45 max-w-2xl mx-auto leading-relaxed">
            We were tired of choosing between paying attention and taking notes.
            So we built an AI assistant that&apos;s invisible, local, and private.
          </p>
        </motion.div>
      </div>

      {/* Stats bento */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8 mb-32">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="rounded-xl glass p-6 text-center"
            >
              <div className="text-3xl sm:text-4xl font-display font-bold text-gradient mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-white/40">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* The problem / solution — bento grid */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8 mb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Problem */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-xl glass p-8 md:p-10"
          >
            <div className="inline-flex items-center gap-2 text-red-400/70 mb-4">
              <WifiOff className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">The Problem</span>
            </div>
            <h2 className="text-2xl font-display font-bold text-white mb-4">
              Existing tools are broken
            </h2>
            <ul className="space-y-3">
              {[
                "Meeting bots join the call — everyone sees them",
                "Audio gets uploaded to someone else's servers",
                "Visible to screen sharing — awkward in client calls",
                "Require accounts, subscriptions, and setup",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-400/50 shrink-0" />
                  <span className="text-sm text-white/45">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Solution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-xl glass p-8 md:p-10 border-purple-500/10"
          >
            <div className="inline-flex items-center gap-2 text-purple-400/70 mb-4">
              <Zap className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Scribely</span>
            </div>
            <h2 className="text-2xl font-display font-bold text-white mb-4">
              A better approach
            </h2>
            <ul className="space-y-3">
              {[
                "No bot joins — it's a desktop overlay, not a participant",
                "All audio processed locally by Whisper on your Mac",
                "Invisible to screen sharing via native macOS APIs",
                "Free, no account needed, setup in under a minute",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                  <span className="text-sm text-white/60">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>

      {/* How it works — visual pipeline */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8 mb-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
            How it works
          </h2>
          <p className="text-white/40 max-w-lg mx-auto">
            Four stages, all happening in real-time on your device.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pipeline.map((step, i) => (
            <motion.div
              key={step.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="relative group"
            >
              <div className="rounded-xl glass glass-hover p-6 h-full">
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${step.color} border border-white/[0.06]`}>
                  <step.icon className={`h-5 w-5 ${step.iconColor}`} />
                </div>
                <div className="text-xs text-white/25 font-mono mb-2">
                  Step {i + 1}
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  {step.title}
                </h3>
                <p className="text-sm text-white/40">{step.detail}</p>
              </div>
              {i < pipeline.length - 1 && (
                <div className="hidden lg:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                  <ArrowRight className="h-4 w-4 text-white/10" />
                </div>
              )}
              {i < pipeline.length - 1 && (
                <div className="flex lg:hidden justify-center py-2">
                  <ArrowDown className="h-4 w-4 text-white/10" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Privacy bento */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8 mb-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="md:col-span-2 rounded-xl glass p-8 md:p-10 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-[300px] h-[200px] bg-purple-600/[0.06] rounded-full blur-[80px]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 text-green-400/70 mb-4">
                <Lock className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Privacy by Design</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-white mb-4">
                Your meetings stay on your Mac
              </h2>
              <p className="text-white/45 max-w-xl leading-relaxed mb-6">
                Choose cloud (OpenAI, Deepgram) for zero setup — or go fully local
                with Whisper and Ollama/LM Studio. Transcripts stay in your
                filesystem. You control where your data goes.
              </p>
              <div className="flex flex-wrap gap-3">
                {["OpenAI / Deepgram", "Local Whisper", "Ollama / LM Studio", "macOS Keychain encryption", "No telemetry"].map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-xl glass p-8 flex flex-col justify-center text-center"
          >
            <div className="mb-4 mx-auto">
              <div className="relative">
                <Wifi className="h-10 w-10 text-white/10" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-[2px] w-12 bg-red-400/60 rotate-45" />
                </div>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Fully local option
            </h3>
            <p className="text-sm text-white/40">
              With Whisper + Ollama/LM Studio, nothing leaves your Mac.
              Or use cloud APIs — your choice.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Who it's for */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8 mb-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
            Built for people who live in meetings
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {useCases.map((uc, i) => (
            <motion.div
              key={uc.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="rounded-xl glass glass-hover p-6 text-center"
            >
              <div className="mb-4 mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-white/[0.06]">
                <uc.icon className="h-5 w-5 text-indigo-400" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-2">
                {uc.title}
              </h3>
              <p className="text-xs text-white/40 leading-relaxed">
                {uc.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Compatibility */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8 mb-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-xl glass p-8 md:p-10"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-blue-400/70 mb-4">
                <Monitor className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Compatibility</span>
              </div>
              <h2 className="text-2xl font-display font-bold text-white mb-4">
                Works with everything
              </h2>
              <p className="text-sm text-white/45 leading-relaxed">
                Scribely works with any meeting platform — it captures audio at
                the system level, so it doesn&apos;t matter what app you&apos;re using.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {["Google Meet", "Zoom", "Microsoft Teams", "Webex", "Slack Huddles", "Any browser call"].map((platform) => (
                <div
                  key={platform}
                  className="rounded-lg bg-white/[0.03] border border-white/[0.04] px-4 py-3 text-sm text-white/50 text-center"
                >
                  {platform}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* CTA */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-2xl text-center"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-indigo-600/15 to-blue-600/20" />
          <div className="absolute inset-0 bg-[#0c0c14]/50" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-purple-500/10 rounded-full blur-[80px]" />
          <div className="absolute inset-0 rounded-2xl border border-white/[0.08]" />

          <div className="relative px-8 py-16 sm:px-16 sm:py-20">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
              Ready to try it?
            </h2>
            <p className="text-lg text-white/45 max-w-md mx-auto mb-8">
              Free to download. No account needed. Just install and go.
            </p>
            <Button size="xl" asChild>
              <Link href="/download">
                Download for Mac
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
