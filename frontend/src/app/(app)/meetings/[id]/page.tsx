"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Video, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/useApi"
import { cn } from "@/lib/utils"

interface TranscriptEntry {
  timestamp?: number
  speaker?: string
  text?: string
  content?: string
  label?: string
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const api = useApi()
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await api.getMeeting(id)
        if (cancelled) return
        const transcript = data as any
        const rawEntries =
          transcript?.transcript?.entries ||
          transcript?.transcript ||
          (Array.isArray(transcript) ? transcript : [])
        setEntries(Array.isArray(rawEntries) ? rawEntries : [])
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load transcript")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [api, id])

  function formatTimestamp(seconds?: number) {
    if (seconds == null) return ""
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, "0")}`
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/meetings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-display font-bold text-white">
          Meeting Transcript
        </h1>
        <p className="mt-1 text-xs font-mono text-white/30">{id}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-white/30" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-card p-12 text-center">
          <Video className="mx-auto h-10 w-10 text-white/20" />
          <p className="mt-4 text-sm text-white/40">
            No transcript entries found for this meeting.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-card divide-y divide-white/[0.04]">
          {entries.map((entry, i) => (
            <div key={i} className="flex gap-3 px-4 py-3">
              {entry.timestamp != null && (
                <span className="shrink-0 w-12 text-right text-xs font-mono text-white/30 pt-0.5">
                  {formatTimestamp(entry.timestamp)}
                </span>
              )}
              <div className="min-w-0">
                {(entry.speaker || entry.label) && (
                  <span className="text-xs font-medium text-purple-400">
                    {entry.speaker || entry.label}
                  </span>
                )}
                <p className="text-sm text-white/80 leading-relaxed">
                  {entry.text || entry.content || ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
