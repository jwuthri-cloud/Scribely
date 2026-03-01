"use client"

import { motion } from "framer-motion"
import { Check, Minus } from "lucide-react"

const features = [
  { name: "macOS Desktop App", free: true, pro: true },
  { name: "Chrome Extension", free: true, pro: true },
  { name: "Live Transcription", free: true, pro: true },
  { name: "AI Chat During Meetings", free: true, pro: true },
  { name: "Fully Local AI (Ollama/LM Studio)", free: true, pro: true },
  { name: "Real-time Insights", free: true, pro: true },
  { name: "Screen-share Invisibility", free: true, pro: true },
  { name: "Local Audio Processing", free: true, pro: true },
  { name: "Unlimited Meetings", free: true, pro: true },
  { name: "Post-meeting Summaries", free: false, pro: true },
  { name: "Action Item Extraction", free: false, pro: true },
  { name: "Meeting Analytics", free: false, pro: true },
  { name: "Transcript Editing", free: false, pro: true },
  { name: "Export Integrations", free: false, pro: true },
  { name: "Meeting Search & History", free: false, pro: true },
  { name: "Priority Support", free: false, pro: true },
]

function FeatureIcon({ available }: { available: boolean }) {
  return available ? (
    <Check className="h-4 w-4 text-purple-400" />
  ) : (
    <Minus className="h-4 w-4 text-white/15" />
  )
}

export function FeatureTable() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="max-w-3xl mx-auto mt-24"
    >
      <h3 className="text-2xl font-display font-bold text-white text-center mb-8">
        Feature comparison
      </h3>

      <div className="rounded-xl glass overflow-hidden">
        <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="text-sm font-medium text-white/40">Feature</div>
          <div className="text-sm font-medium text-white/60 text-center">Free</div>
          <div className="text-sm font-medium text-purple-400 text-center">Pro</div>
        </div>

        {features.map((feature, i) => (
          <div
            key={feature.name}
            className={`grid grid-cols-3 gap-4 px-6 py-3 ${
              i < features.length - 1 ? "border-b border-white/[0.03]" : ""
            }`}
          >
            <div className="text-sm text-white/60">{feature.name}</div>
            <div className="flex justify-center">
              <FeatureIcon available={feature.free} />
            </div>
            <div className="flex justify-center">
              <FeatureIcon available={feature.pro} />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
