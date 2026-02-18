"use client"

import { motion } from "framer-motion"
import { Apple, Chrome, Monitor, Cpu, HardDrive, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DownloadCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
      {/* macOS App */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="relative rounded-xl glass p-8"
      >
        <div className="absolute -inset-px rounded-xl bg-gradient-to-b from-purple-500/10 to-transparent -z-10" />

        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/10">
          <Apple className="h-7 w-7 text-purple-400" />
        </div>

        <h3 className="text-xl font-semibold text-white mb-2">
          Scribely for Mac
        </h3>
        <p className="text-sm text-white/40 mb-6">
          The desktop overlay app. Runs silently alongside your meetings with
          live transcription and AI assistance.
        </p>

        <Button className="w-full mb-6" size="lg" asChild>
          <a href="https://github.com/Jwuthri/Scribely-Release/releases/download/Version0.1.0/Scribely-0.1.0-arm64.dmg.zip" target="_blank" rel="noopener noreferrer">
            <Apple className="mr-2 h-4 w-4" />
            Download for macOS
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>

        <div className="space-y-3">
          <h4 className="text-xs font-medium text-white/30 uppercase tracking-wider">
            System Requirements
          </h4>
          <div className="space-y-2">
            {[
              { icon: Monitor, label: "macOS 13 (Ventura) or later" },
              { icon: Cpu, label: "Apple Silicon (M1+) recommended" },
              { icon: HardDrive, label: "2 GB free disk space" },
            ].map((req) => (
              <div key={req.label} className="flex items-center gap-2">
                <req.icon className="h-3.5 w-3.5 text-white/20" />
                <span className="text-xs text-white/40">{req.label}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Chrome Extension */}
      <motion.div
        id="chrome"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative rounded-xl glass p-8"
      >
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/10">
          <Chrome className="h-7 w-7 text-blue-400" />
        </div>

        <h3 className="text-xl font-semibold text-white mb-2">
          Chrome Extension
        </h3>
        <p className="text-sm text-white/40 mb-6">
          Capture tab audio from browser-based meetings. One-click setup for
          Google Meet, Zoom, Teams, and more.
        </p>

        <Button className="w-full mb-6" size="lg" variant="secondary" asChild>
          <a href="https://github.com/Jwuthri/Scribely-Release/blob/main/chrome-extension.zip" target="_blank" rel="noopener noreferrer">
            <Chrome className="mr-2 h-4 w-4" />
            Add to Chrome
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>

        <div className="space-y-3">
          <h4 className="text-xs font-medium text-white/30 uppercase tracking-wider">
            Compatibility
          </h4>
          <div className="space-y-2">
            {[
              { icon: Chrome, label: "Google Chrome or Chromium-based browsers" },
              { icon: Monitor, label: "Requires Scribely desktop app running" },
            ].map((req) => (
              <div key={req.label} className="flex items-center gap-2">
                <req.icon className="h-3.5 w-3.5 text-white/20" />
                <span className="text-xs text-white/40">{req.label}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export function QuickStart() {
  const steps = [
    {
      number: "1",
      title: "Download & Install",
      description: "Download the Scribely DMG, drag to Applications, and launch.",
    },
    {
      number: "2",
      title: "Grant Permissions",
      description:
        "Allow microphone access and screen recording permissions when prompted.",
    },
    {
      number: "3",
      title: "Install Extension (Optional)",
      description:
        "Add the Chrome extension for best audio quality in browser meetings.",
    },
    {
      number: "4",
      title: "Start a Meeting",
      description:
        "Press Alt+M or click Start Meeting. Scribely begins transcribing automatically.",
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="max-w-3xl mx-auto mt-24"
    >
      <h3 className="text-2xl font-display font-bold text-white text-center mb-8">
        Quick start guide
      </h3>

      <div className="space-y-4">
        {steps.map((step, i) => (
          <motion.div
            key={step.number}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="flex gap-4 rounded-xl glass p-5"
          >
            <div className="shrink-0 h-8 w-8 rounded-full bg-purple-500/20 border border-purple-500/20 flex items-center justify-center">
              <span className="text-sm font-bold text-purple-400">
                {step.number}
              </span>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">
                {step.title}
              </h4>
              <p className="text-sm text-white/40">{step.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
