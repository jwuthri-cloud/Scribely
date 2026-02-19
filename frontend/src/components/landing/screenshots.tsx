"use client"

import { useState, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

const screenshots = [
  {
    title: "Live Transcription",
    description:
      "Real-time transcription with speaker labels, timestamps, and audio source badges.",
    image: "/screenshots/app-main.png",
    gradient: "from-purple-500/20 to-indigo-500/20",
  },
  {
    title: "Compact Mode",
    description:
      "A minimal chat-only view for when you just need quick AI answers during a meeting.",
    image: "/screenshots/app-compact.png",
    gradient: "from-indigo-500/20 to-blue-500/20",
  },
  {
    title: "Live Insights",
    description:
      "Automatic detection of questions, decisions, action items, and key moments.",
    image: "/screenshots/app-insights.png",
    gradient: "from-blue-500/20 to-cyan-500/20",
  },
  {
    title: "Settings & Customization",
    description:
      "Choose your model, adjust creativity, pick a theme, and configure quick actions.",
    image: "/screenshots/app-settings.png",
    gradient: "from-cyan-500/20 to-purple-500/20",
  },
]

export function Screenshots() {
  const [selected, setSelected] = useState<number | null>(null)

  const close = useCallback(() => setSelected(null), [])

  useEffect(() => {
    if (selected === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selected, close])

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {screenshots.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group"
            >
              <button
                onClick={() => setSelected(i)}
                className="relative rounded-xl overflow-hidden mb-4 w-full cursor-zoom-in"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-50`}
                />
                <div className="relative aspect-[3/4] rounded-xl border border-white/[0.06] bg-[#0c0c14] overflow-hidden flex items-center justify-center p-2 group-hover:border-purple-500/30 transition-colors">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-auto rounded-lg group-hover:scale-[1.02] transition-transform duration-300"
                  />
                </div>
              </button>
              <h3 className="text-base font-semibold text-white mb-1">
                {item.title}
              </h3>
              <p className="text-sm text-white/40">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selected !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
            onClick={close}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="relative max-w-2xl w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={close}
                className="absolute -top-10 right-0 text-white/50 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
              <img
                src={screenshots[selected].image}
                alt={screenshots[selected].title}
                className="w-full h-auto rounded-2xl shadow-2xl"
              />
              <p className="text-center text-sm text-white/50 mt-3">
                {screenshots[selected].title}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
