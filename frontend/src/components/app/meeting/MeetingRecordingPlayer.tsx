"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Player } from "@remotion/player"
import { MeetingReviewComposition, type CaptionSegment } from "@/remotion/MeetingReviewComposition"
import type { NormalizedTranscriptEntry } from "@/lib/meeting-transcript"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"
import { WorkspaceSurface } from "@/components/app/workspace/WorkspaceSurface"
import { Video as VideoIcon } from "lucide-react"

const FPS = 30

function toCaptions(entries: NormalizedTranscriptEntry[]): CaptionSegment[] {
  return entries.map((e, i) => {
    const start = e.startSeconds ?? 0
    const next = entries[i + 1]
    const end =
      e.endSeconds ??
      (next?.startSeconds != null && next.startSeconds > start ? next.startSeconds : start + 6)
    return {
      startSec: start,
      endSec: Math.max(end, start + 0.2),
      speaker: e.speaker,
      text: e.text,
    }
  })
}

export function MeetingRecordingPlayer({
  meetingId,
  entries,
  hasRecording,
  loadBlob,
}: {
  meetingId: string
  entries: NormalizedTranscriptEntry[]
  hasRecording: boolean
  loadBlob: () => Promise<Blob>
}) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [durationSec, setDurationSec] = useState(30)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const runLoad = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const blob = await loadBlob()
      const url = URL.createObjectURL(blob)
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }
      blobUrlRef.current = url
      setVideoSrc(url)
      const vid = document.createElement("video")
      vid.preload = "metadata"
      vid.src = url
      await new Promise<void>((res, rej) => {
        vid.onloadedmetadata = () => res()
        vid.onerror = () => rej(new Error("Could not read video metadata"))
      })
      if (vid.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
        setDurationSec(Math.max(4, vid.duration))
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load recording")
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      setVideoSrc(null)
    } finally {
      setLoading(false)
    }
  }, [loadBlob])

  useEffect(() => {
    if (!hasRecording) return
    void runLoad()
  }, [hasRecording, meetingId, runLoad])

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [])

  const captions = useMemo(() => toCaptions(entries), [entries])
  const durationInFrames = Math.max(FPS, Math.ceil(durationSec * FPS))

  if (!hasRecording) {
    return (
      <WorkspaceSurface className="flex w-full min-w-0 flex-col items-center justify-center gap-3 p-10 text-center sm:p-14">
        <VideoIcon className="h-10 w-10 text-white/15" aria-hidden />
        <p className="text-sm text-white/45">
          No recording was uploaded for this meeting (transcript-only sync). Video stays on your Mac
          under ~/Documents/Scribely/recordings/ until you sync with a recording attached.
        </p>
      </WorkspaceSurface>
    )
  }

  if (loading) {
    return (
      <WorkspaceSurface className="flex min-h-[200px] w-full min-w-0 items-center justify-center p-8">
        <CoreSpinLoader showText className="min-h-0" />
      </WorkspaceSurface>
    )
  }

  if (err || !videoSrc) {
    return (
      <WorkspaceSurface className="w-full min-w-0 border border-amber-500/20 bg-amber-500/[0.06] p-6 text-sm text-amber-100">
        <p className="font-medium">Recording unavailable</p>
        <p className="mt-2 text-white/60">{err ?? "Unknown error"}</p>
        <button
          type="button"
          onClick={() => void runLoad()}
          className="mt-4 rounded-lg border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-medium text-white hover:bg-white/[0.1]"
        >
          Retry
        </button>
      </WorkspaceSurface>
    )
  }

    return (
      <WorkspaceSurface className="w-full min-w-0 max-w-full overflow-hidden p-0" variant="panel">
        <div className="aspect-video w-full min-w-0 bg-black">
        <Player
          component={MeetingReviewComposition}
          inputProps={{ videoSrc, captions }}
          durationInFrames={durationInFrames}
          compositionWidth={1280}
          compositionHeight={720}
          fps={FPS}
          controls
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </WorkspaceSurface>
  )
}
