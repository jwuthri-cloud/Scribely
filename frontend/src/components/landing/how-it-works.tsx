"use client"

import { motion } from "framer-motion"
import { Download, Video, Sparkles } from "lucide-react"

const steps = [
  {
    icon: Download,
    number: "1",
    title: "Install",
    description:
      "Download the Scribely app for Mac and the optional Chrome extension. Setup takes under a minute.",
  },
  {
    icon: Video,
    number: "2",
    title: "Start Meeting",
    description:
      "Join any video call. Scribely automatically detects and begins analyzing the audio.",
  },
  {
    icon: Sparkles,
    number: "3",
    title: "Get Insights",
    description:
      "Access real-time transcription, AI chat, and live insights — all privately on your screen.",
  },
]

export function HowItWorks() {
  return (
    <section className="relative py-32">
      {/* Subtle background glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-purple-600/[0.06] rounded-full blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
            Get started in 3 steps
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            From download to your first AI-powered meeting in under a minute.
          </p>
        </motion.div>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-purple-500/20 to-transparent" />

          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative text-center"
            >
              <div className="inline-flex items-center justify-center mb-6">
                <div className="relative">
                  <div className="absolute -inset-3 rounded-full bg-purple-500/10 blur-md" />
                  <div className="relative h-14 w-14 rounded-full bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/20 flex items-center justify-center">
                    <step.icon className="h-6 w-6 text-purple-400" />
                  </div>
                  <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-purple-600 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white">
                      {step.number}
                    </span>
                  </div>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-white/40 max-w-xs mx-auto leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
