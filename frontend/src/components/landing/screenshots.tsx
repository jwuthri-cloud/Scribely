"use client"

import { useRef, useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Play, Pause, Volume2, VolumeX } from "lucide-react"

export function Screenshots() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play()
      setPlaying(true)
      setHasStarted(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onTime = () => {
      if (v.duration) setProgress(v.currentTime / v.duration)
    }
    const onEnded = () => {
      setPlaying(false)
      setProgress(0)
      setHasStarted(false)
    }

    v.addEventListener("timeupdate", onTime)
    v.addEventListener("ended", onEnded)
    return () => {
      v.removeEventListener("timeupdate", onTime)
      v.removeEventListener("ended", onEnded)
    }
  }, [])

  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    v.currentTime = ratio * v.duration
    setProgress(ratio)
  }

  return (
    <section className="relative py-16 sm:py-20">
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

        {/* Video player */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative mx-auto max-w-4xl"
        >
          {/* Glow effect */}
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-purple-500/30 via-indigo-500/20 to-blue-500/30 blur-xl opacity-60 pointer-events-none" />

          {/* Player wrapper */}
          <div
            className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0c0c14] shadow-2xl cursor-pointer group"
            onClick={togglePlay}
          >
            <video
              ref={videoRef}
              src="/demo.mp4"
              muted
              playsInline
              preload="metadata"
              className="w-full h-auto block"
            />

            {/* Big play button overlay (shown until first play) */}
            {!hasStarted && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
                  <Play className="w-8 h-8 text-white fill-white ml-1" />
                </div>
              </div>
            )}

            {/* Controls bar */}
            <div
              className="absolute bottom-0 left-0 right-0 px-4 py-3 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Play/pause */}
              <button
                onClick={togglePlay}
                className="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>

              {/* Scrubber */}
              <div
                className="flex-1 h-1 bg-white/20 rounded-full cursor-pointer relative overflow-hidden"
                onClick={scrub}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-purple-400 rounded-full transition-[width] duration-100"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>

              {/* Mute */}
              <button
                onClick={toggleMute}
                className="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Feature chips below the video */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-wrap justify-center gap-3 mt-10"
        >
          {[
            "Live Transcription",
            "AI Q&A",
            "Live Insights",
            "Screen-Share Invisible",
            "100% Local AI",
            "Chrome Extension",
          ].map((label) => (
            <span
              key={label}
              className="px-4 py-1.5 rounded-full text-sm font-medium bg-white/[0.05] border border-white/[0.08] text-white/60"
            >
              {label}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
