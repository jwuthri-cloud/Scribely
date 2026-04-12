"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Video } from "lucide-react"
import { MeetingReviewHeader } from "@/components/app/meeting/MeetingReviewHeader"
import { MeetingRecordingPlayer } from "@/components/app/meeting/MeetingRecordingPlayer"
import { TranscriptViewer } from "@/components/app/meeting/TranscriptViewer"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"
import { WorkspaceSurface } from "@/components/app/workspace/WorkspaceSurface"
import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/useApi"
import {
  ApiError,
  type EnrichedTranscriptResponse,
  type MeetingDetail,
  type ProcessingStatusResponse,
} from "@/lib/api"
import {
  normalizeTranscriptBlob,
  type NormalizedTranscriptEntry,
} from "@/lib/meeting-transcript"

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const api = useApi()
  const [summary, setSummary] = useState<MeetingDetail | null>(null)
  const [payload, setPayload] = useState<EnrichedTranscriptResponse | null>(null)
  const [proc, setProc] = useState<ProcessingStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [draftEntries, setDraftEntries] = useState<NormalizedTranscriptEntry[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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

  useEffect(() => {
    if (!editMode) {
      setDraftEntries(normalized.entries)
    }
  }, [normalized.entries, payload, editMode])

  const loadRecordingBlob = useCallback(() => api.fetchMeetingRecordingBlob(id), [api, id])

  const hasRecording = summary?.has_recording === true

  const startEdit = () => {
    setSaveError(null)
    setDraftEntries(normalized.entries.map((e) => ({ ...e })))
    setEditMode(true)
  }

  const cancelEdit = () => {
    setSaveError(null)
    setDraftEntries(normalized.entries)
    setEditMode(false)
  }

  const saveEdit = async () => {
    setSaveError(null)
    setSaving(true)
    try {
      const res = await api.patchMeetingTranscript(
        id,
        draftEntries.map((e) => ({ speaker: e.speaker, text: e.text }))
      )
      setPayload(res)
      setEditMode(false)
      const next = await api.getMeetingSummary(id).catch(() => null)
      if (next) setSummary(next)
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Save failed"
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  const displayEntries = editMode ? draftEntries : normalized.entries

  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 space-y-8 pb-16">
      {loading ? (
        <div className="space-y-6">
          <div className="h-11 w-40 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="workspace-card h-56 animate-pulse" />
          <div className="workspace-card flex h-96 items-center justify-center">
            <CoreSpinLoader showText={false} className="min-h-0" />
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
            normalizedTranscript={normalized}
          />

          {isProcessing && (
            <WorkspaceSurface
              className="flex items-center gap-3 border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-100"
              variant="panel"
            >
              <CoreSpinLoader size="sm" showText={false} className="min-h-0" />
              <span>
                Processing recording (diarization / speaker ID). This page will refresh when
                complete.
              </span>
            </WorkspaceSurface>
          )}

          <div className="grid w-full min-w-0 grid-cols-1 gap-6 lg:[grid-template-columns:repeat(2,minmax(0,1fr))] lg:items-start lg:gap-8 xl:gap-10">
            <section className="min-w-0 max-w-full space-y-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                Recording
              </h2>
              <MeetingRecordingPlayer
                meetingId={id}
                entries={editMode ? draftEntries : normalized.entries}
                hasRecording={hasRecording}
                loadBlob={loadRecordingBlob}
              />
            </section>

            <section className="flex min-h-0 min-w-0 max-w-full flex-col space-y-3">
              {normalized.entries.length > 0 ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {!editMode ? (
                    <Button type="button" variant="secondary" size="sm" onClick={startEdit}>
                      Edit transcript
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void saveEdit()}
                        disabled={saving}
                      >
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
              {saveError ? <p className="text-sm text-red-400 sm:text-right">{saveError}</p> : null}
              {normalized.entries.length === 0 ? (
                <WorkspaceSurface className="flex flex-1 flex-col items-center justify-center p-10 text-center sm:p-14">
                  <Video className="h-12 w-12 text-white/15" />
                  <p className="mt-4 text-sm text-white/45">
                    No transcript lines found for this meeting yet.
                  </p>
                </WorkspaceSurface>
              ) : (
                <TranscriptViewer
                  entries={displayEntries}
                  editable={editMode}
                  onChange={editMode ? setDraftEntries : undefined}
                  disabled={saving}
                />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
