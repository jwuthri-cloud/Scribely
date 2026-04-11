"use client"

import { motion } from "framer-motion"
import {
  Check,
  X,
  Zap,
  Clock,
  DollarSign,
  Shield,
  Sliders,
  Sparkles,
  Gauge,
  Eye,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

const comparisonRows = [
  {
    feature: "Price",
    icon: DollarSign,
    scribely: "Free",
    scribelyDetail: "Core features free forever",
    competitor: "$20–75/mo",
    competitorDetail: "Invisibility costs $75/mo extra",
    scribelyWins: true,
  },
  {
    feature: "Response Speed",
    icon: Gauge,
    scribely: "Instant",
    scribelyDetail: "Local processing, zero network latency",
    competitor: "5–10 seconds",
    competitorDetail: "Cloud round-trip causes noticeable lag",
    scribelyWins: true,
  },
  {
    feature: "Privacy",
    icon: Shield,
    scribely: "100% local",
    scribelyDetail: "Choose cloud (OpenAI, Deepgram) or fully local (Ollama/LM Studio). Your choice.",
    competitor: "Cloud-based",
    competitorDetail: "Audio sent to external servers for processing",
    scribelyWins: true,
  },
  {
    feature: "Screen-share Invisibility",
    icon: Eye,
    scribely: "Always free",
    scribelyDetail: "Native macOS API, included in free tier",
    competitor: "$75/mo add-on",
    competitorDetail: "Locked behind highest-priced plan",
    scribelyWins: true,
  },
  {
    feature: "Live Insights",
    icon: Sparkles,
    scribely: "Real-time detection",
    scribelyDetail: "Questions, action items, decisions — as they happen",
    competitor: "Basic notes",
    competitorDetail: "Post-meeting summaries, limited live detection",
    scribelyWins: true,
  },
  {
    feature: "Configurability",
    icon: Sliders,
    scribely: "Fully customizable",
    scribelyDetail: "Custom prompts, hotkeys, themes, 3 Whisper models",
    competitor: "Limited",
    competitorDetail: "Preset modes, minimal user control",
    scribelyWins: true,
  },
  {
    feature: "Reliability",
    icon: Zap,
    scribely: "Runs offline",
    scribelyDetail: "No server dependency, works without internet",
    competitor: "Server-dependent",
    competitorDetail: "Outages and lag reported by users",
    scribelyWins: true,
  },
  {
    feature: "Setup Time",
    icon: Clock,
    scribely: "< 1 minute",
    scribelyDetail: "Download, install, done. No account needed",
    competitor: "Account required",
    competitorDetail: "Sign-up, payment, onboarding flow",
    scribelyWins: true,
  },
]

export function Comparison() {
  return (
    <section className="relative py-16 sm:py-20">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/4 w-[500px] h-[300px] bg-purple-600/[0.04] rounded-full blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <Badge className="mb-4">Why switch</Badge>
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
            Scribely vs Cluely
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            Same concept, completely different execution. Faster, private, free,
            and actually built for real professionals.
          </p>
        </motion.div>

        {/* Comparison table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="rounded-xl glass overflow-hidden"
        >
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 px-6 py-5 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="text-sm font-medium text-white/40" />
            <div className="text-center">
              <div className="inline-flex items-center gap-2">
                <img
                  src="/scribely-icon.png"
                  alt="Scribely"
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded-md object-contain"
                />
                <span className="text-sm font-semibold text-white">Scribely</span>
              </div>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center min-h-[22px]">
                <span className="text-sm font-semibold text-white/40 tracking-tight">
                  Cluely
                </span>
              </div>
            </div>
          </div>

          {/* Rows */}
          {comparisonRows.map((row, i) => (
            <div
              key={row.feature}
              className={`grid grid-cols-[1fr_1fr_1fr] gap-4 px-6 py-4 ${
                i < comparisonRows.length - 1 ? "border-b border-white/[0.03]" : ""
              }`}
            >
              {/* Feature name */}
              <div className="flex items-center gap-3">
                <row.icon className="h-4 w-4 text-white/20 shrink-0 hidden sm:block" />
                <span className="text-sm font-medium text-white/60">{row.feature}</span>
              </div>

              {/* Scribely */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-0.5">
                  <Check className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-sm font-medium text-white/80">{row.scribely}</span>
                </div>
                <p className="text-[11px] text-white/30 hidden sm:block">{row.scribelyDetail}</p>
              </div>

              {/* Competitor */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-0.5">
                  <X className="h-3.5 w-3.5 text-red-400/60" />
                  <span className="text-sm text-white/40">{row.competitor}</span>
                </div>
                <p className="text-[11px] text-white/20 hidden sm:block">{row.competitorDetail}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Bottom callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div className="rounded-xl glass p-5 text-center">
            <div className="text-2xl font-display font-bold text-gradient mb-1">$0</div>
            <p className="text-xs text-white/40">
              Scribely is free. Cluely charges up to $75/mo for features we include by default.
            </p>
          </div>
          <div className="rounded-xl glass p-5 text-center">
            <div className="text-2xl font-display font-bold text-gradient mb-1">10x faster</div>
            <p className="text-xs text-white/40">
              Local processing means instant responses. No 5-10 second cloud round-trips.
            </p>
          </div>
          <div className="rounded-xl glass p-5 text-center">
            <div className="text-2xl font-display font-bold text-gradient mb-1">0 bytes</div>
            <p className="text-xs text-white/40">
              Choose fully local (Ollama/LM Studio) — nothing leaves your Mac. Or use cloud APIs you control. Cluely sends everything to their servers.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
