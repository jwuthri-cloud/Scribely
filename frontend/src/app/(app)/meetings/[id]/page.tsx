"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { Video } from "lucide-react"
import { MeetingReviewHeader } from "@/components/app/meeting/MeetingReviewHeader"
import { TranscriptViewer } from "@/components/app/meeting/TranscriptViewer"
import { LoadingDots } from "@/components/app/workspace/LoadingDots"
import { WorkspaceSurface } from "@/components/app/workspace/WorkspaceSurface"
import { useApi } from "@/hooks/useApi"
import type { EnrichedTranscriptResponse, MeetingSummary, ProcessingStatusResponse } from "@/lib/api"
import { normalizeTranscriptBlob } from "@/lib/meeting-transcript"

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const api = useApi()
  const [summary, setSummary] = useState<MeetingSummary | null>(null)
  const [payload, setPayload] = useState<EnrichedTranscriptResponse | null>(null)
  const [proc, setProc] = useState<ProcessingStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [sum, transcriptRes, statusRes] = await Promise.all([
          api.getMeetingSummary(id).catch(() => null),
          api.getMeeting(id),
          api.getMeetingStatus(id).catch(() => null),
        ])
        if (cancelled) return
        setSummary(sum)
        setPayload(transcriptRes)
        setProc(statusRes)
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load meeting"
          setError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [api, id])

  const isProcessing =
    summary?.status === "processing" || proc?.status === "processing"

  useEffect(() => {
    if (!isProcessing) return
    const iv = setInterval(async () => {
      try {
        const st = await api.getMeetingStatus(id)
        setProc(st)
        if (st.status !== "processing") {
          const [sum, tr] = await Promise.all([
            api.getMeetingSummary(id).catch(() => null),
            api.getMeeting(id),
          ])
          if (sum) setSummary(sum)
          setPayload(tr)
        }
      } catch {
        // ignore
      }
    }, 4000)
    return () => clearInterval(iv)
  }, [api, id, isProcessing])

  const normalized = useMemo(() => {
    if (!payload?.transcript) {
      return normalizeTranscriptBlob(null)
    }
    return normalizeTranscriptBlob(payload.transcript)
  }, [payload])

  const durationMs = normalized.summary.durationMs

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {loading ? (
        <div className="space-y-6">
          <div className="h-11 w-40 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="workspace-card h-56 animate-pulse" />
          <div className="workspace-card flex h-96 items-center justify-center">
            <LoadingDots />
          </div>
        </div>
      ) : error ? (
        <div className="workspace-card border border-red-500/20 bg-red-500/5 p-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : (
        <>
          <MeetingReviewHeader
            meetingId={id}
            summary={summary}
            hasEnrichedTranscript={payload?.hasEnrichedTranscript ?? false}
            transcriptEntryCount={normalized.entries.length}
            transcriptDurationMs={durationMs}
            createdAt={normalized.createdAt}
            fromDiarization={normalized.fromDiarization}
          />

          {isProcessing && (
            <WorkspaceSurface
              className="flex items-center gap-3 border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-100"
              variant="panel"
            >
              <LoadingDots dotClassName="h-2 w-2 bg-amber-200" />
              <span>
                Processing recording (diarization / speaker ID). This page will refresh when
                complete.
              </span>
            </WorkspaceSurface>
          )}

          {normalized.entries.length === 0 ? (
            <WorkspaceSurface className="p-14 text-center">
              <Video className="mx-auto h-12 w-12 text-white/15" />
              <p className="mt-4 text-sm text-white/45">
                No transcript lines found for this meeting yet.
              </p>
            </WorkspaceSurface>
          ) : (
            <TranscriptViewer entries={normalized.entries} />
          )}
        </>
      )}
    </div>
  )
}
