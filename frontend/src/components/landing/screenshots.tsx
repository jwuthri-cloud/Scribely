"use client"

import { motion } from "framer-motion"

const screenshots = [
  {
    title: "Live Transcription",
    description: "Watch your meeting unfold in real-time with speaker labels and timestamps.",
    gradient: "from-purple-500/20 to-indigo-500/20",
  },
  {
    title: "AI-Powered Chat",
    description: "Ask questions about your meeting and get instant, context-aware answers.",
    gradient: "from-indigo-500/20 to-blue-500/20",
  },
  {
    title: "Real-time Insights",
    description: "Automatic detection of action items, decisions, and key moments.",
    gradient: "from-blue-500/20 to-cyan-500/20",
  },
]

export function Screenshots() {
  return (
    <section className="relative py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
            See it in action
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            A powerful overlay that stays out of your way while giving you
            everything you need.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {screenshots.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group"
            >
              {/* Placeholder screenshot area */}
              <div className="relative rounded-xl overflow-hidden mb-4">
                <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-50`} />
                <div className="relative aspect-[4/3] rounded-xl border border-white/[0.06] bg-[#0c0c14] flex items-center justify-center">
                  <div className="text-center p-6">
                    <div className="w-16 h-16 rounded-xl bg-white/[0.04] border border-white/[0.06] mx-auto mb-3 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/30 to-indigo-500/30" />
                    </div>
                    <p className="text-xs text-white/20">Screenshot placeholder</p>
                  </div>
                </div>
              </div>
              <h3 className="text-base font-semibold text-white mb-1">
                {item.title}
              </h3>
              <p className="text-sm text-white/40">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
