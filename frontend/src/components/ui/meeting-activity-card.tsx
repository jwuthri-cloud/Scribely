"use client"

import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Clock3, FileText, ArrowRight, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface MeetingActivityCardProps {
  alertMessage?: string
  totalMeetings: number
  totalDurationSeconds: number
  totalTranscriptLines: number
  activityData: number[]
  ctaText?: string
  ctaHref?: string
  className?: string
  loading?: boolean
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.02 },
  },
}

const barVariants = {
  hidden: { y: "100%", opacity: 0 },
  visible: {
    y: "0%",
    opacity: 1,
    transition: { type: "spring", stiffness: 100, damping: 12 },
  },
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function MeetingActivityCard({
  alertMessage,
  totalMeetings,
  totalDurationSeconds,
  totalTranscriptLines,
  activityData,
  ctaText = "Browse all meetings",
  ctaHref = "/meetings",
  className,
  loading = false,
}: MeetingActivityCardProps) {
  const maxVal = Math.max(...activityData, 1)
  const normalizedData = activityData.map((v) => v / maxVal)

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 flex flex-col gap-5",
        className
      )}
    >
      <AnimatePresence>
        {alertMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm font-medium text-amber-200"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{alertMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-3">
          <div className="h-10 w-40 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-5 w-56 animate-pulse rounded bg-white/[0.04]" />
        </div>
      ) : (
        <div className="flex flex-col">
          <h2 className="text-4xl font-bold tracking-tight text-white">
            {totalMeetings} Meeting{totalMeetings !== 1 ? "s" : ""}
          </h2>
          <p className="mt-1 text-sm text-white/40">
            {formatDuration(totalDurationSeconds)} recorded &middot;{" "}
            {totalTranscriptLines.toLocaleString()} transcript lines
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex h-16 items-end gap-[2px]">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 animate-pulse rounded-t-full bg-white/[0.06]"
              style={{ height: `${Math.random() * 60 + 20}%` }}
            />
          ))}
        </div>
      ) : activityData.length > 0 && activityData.some((v) => v > 0) ? (
        <div className="w-full" aria-label="Meeting activity over time">
          <motion.div
            className="flex h-16 w-full items-end gap-[2px]"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {normalizedData.map((height, index) => (
              <motion.div
                key={index}
                className="flex-1 rounded-t-full bg-white/80"
                style={{ height: `${Math.max(height * 100, 4)}%` }}
                variants={barVariants}
                aria-hidden="true"
              />
            ))}
          </motion.div>
        </div>
      ) : (
        <div className="flex h-16 items-center justify-center">
          <p className="text-xs text-white/25">No activity data yet</p>
        </div>
      )}

      <div className="flex items-center gap-4 text-sm text-white/40">
        <span className="inline-flex items-center gap-1.5">
          <Video className="h-4 w-4" />
          {totalMeetings} synced
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-4 w-4" />
          {formatDuration(totalDurationSeconds)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-4 w-4" />
          {totalTranscriptLines.toLocaleString()} lines
        </span>
      </div>

      <Button asChild size="lg" className="w-full">
        <Link href={ctaHref}>
          {ctaText} <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  )
}
