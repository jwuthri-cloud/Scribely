"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ChevronDown, ChevronRight, Video, Workflow } from "lucide-react"
import { MeetingPeoplePanel } from "@/components/app/meeting/MeetingPeoplePanel"
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
  type MeetingRuleExecutionItem,
  type MeetingRuleExecutionStep,
  type ProcessingStatusResponse,
} from "@/lib/api"
import {
  normalizeTranscriptBlob,
  type NormalizedTranscriptEntry,
} from "@/lib/meeting-transcript"
import { JsonCodeBlock, RuleStepResult } from "@/components/app/meeting/RuleStepResult"

function RuleExecutionStepItem({
  step,
  idx,
}: {
  step: MeetingRuleExecutionStep
  idx: number
}) {
  const [mode, setMode] = useState<"pretty" | "raw">("pretty")
  const hasResult = step.result !== null && step.result !== undefined
  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-white/85">
          {step.name ?? `Step ${idx + 1}`}
        </span>
        {step.step_type ? (
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/45">
            {step.step_type}
          </span>
        ) : null}
        {typeof step.ok === "boolean" ? (
          <span
            className={
              step.ok
                ? "text-[10px] uppercase text-emerald-400/80"
                : "text-[10px] uppercase text-red-400/80"
            }
          >
            {step.ok ? "ok" : "failed"}
          </span>
        ) : null}
        {hasResult ? (
          <div className="ml-auto inline-flex overflow-hidden rounded border border-white/10 text-[10px] font-medium">
            <button
              type="button"
              onClick={() => setMode("pretty")}
              className={
                "px-2 py-0.5 uppercase tracking-wide transition " +
                (mode === "pretty"
                  ? "bg-white/10 text-white/90"
                  : "text-white/50 hover:text-white/80")
              }
            >
              Pretty
            </button>
            <button
              type="button"
              onClick={() => setMode("raw")}
              className={
                "px-2 py-0.5 uppercase tracking-wide transition " +
                (mode === "raw"
                  ? "bg-white/10 text-white/90"
                  : "text-white/50 hover:text-white/80")
              }
            >
              Raw
            </button>
          </div>
        ) : null}
      </div>
      {step.error ? (
        <p className="mt-1 text-xs text-red-400/90">{step.error}</p>
      ) : null}
      {hasResult ? (
        <div className="mt-2">
          {mode === "pretty" ? (
            <RuleStepResult value={step.result} stepType={step.step_type} />
          ) : (
            <JsonCodeBlock value={step.result} />
          )}
        </div>
      ) : null}
    </li>
  )
}

function RuleExecutionSteps({ steps }: { steps: MeetingRuleExecutionStep[] }) {
  return (
    <ol className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
      {steps.map((step, idx) => (
        <RuleExecutionStepItem
          key={step.step_id ?? `step-${idx}`}
          step={step}
          idx={idx}
        />
      ))}
    </ol>
  )
}

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
  const [ruleRuns, setRuleRuns] = useState<MeetingRuleExecutionItem[]>([])
  const [openRuleRunId, setOpenRuleRunId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [sum, transcriptRes, statusRes, rulesRes] = await Promise.all([
          api.getMeetingSummary(id).catch(() => null),
          api.getMeeting(id),
          api.getMeetingStatus(id).catch(() => null),
          api.getMeetingRuleExecutions(id).catch(() => [] as MeetingRuleExecutionItem[]),
        ])
        if (cancelled) return
        setSummary(sum)
        setPayload(transcriptRes)
        setProc(statusRes)
        setRuleRuns(rulesRes)
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
          const [sum, tr, rules] = await Promise.all([
            api.getMeetingSummary(id).catch(() => null),
            api.getMeeting(id),
            api.getMeetingRuleExecutions(id).catch(() => [] as MeetingRuleExecutionItem[]),
          ])
          if (sum) setSummary(sum)
          setPayload(tr)
          setRuleRuns(rules)
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

          <WorkspaceSurface variant="panel" className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-white/35" />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                Automation rules
              </h2>
            </div>
            {ruleRuns.length === 0 ? (
              <p className="text-sm text-white/45">
                No rules have run for this meeting yet (e.g. before/after upload triggers or a test
                run from the rule editor).
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {ruleRuns.map((r) => {
                  const expanded = openRuleRunId === r.id
                  const steps = r.step_results
                  return (
                    <li
                      key={r.id}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                    >
                      <div
                        className="flex cursor-pointer items-start gap-2 rounded-md outline-none hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-white/20"
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                        onClick={() =>
                          setOpenRuleRunId((prev) => (prev === r.id ? null : r.id))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setOpenRuleRunId((prev) => (prev === r.id ? null : r.id))
                          }
                        }}
                      >
                        <span className="mt-0.5 shrink-0 text-white/40">
                          {expanded ? (
                            <ChevronDown className="h-4 w-4" aria-hidden />
                          ) : (
                            <ChevronRight className="h-4 w-4" aria-hidden />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="min-w-0">
                              <span
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="inline"
                              >
                                <Link
                                  href={`/rules/${r.rule_id}`}
                                  className="font-medium text-white/90 underline-offset-2 hover:underline"
                                >
                                  {r.rule_name}
                                </Link>
                              </span>
                              <span className="text-white/40">
                                {" "}
                                · {r.trigger.replace(/_/g, " ")}
                              </span>
                            </div>
                            <span
                              className={`shrink-0 text-xs uppercase tracking-wide ${
                                r.status === "completed"
                                  ? "text-emerald-400/90"
                                  : r.status === "failed"
                                    ? "text-red-400/90"
                                    : "text-white/50"
                              }`}
                            >
                              {r.status}
                            </span>
                          </div>
                          {r.error ? (
                            <p className="mt-1 text-xs text-red-400/85">{r.error}</p>
                          ) : null}
                          <p className="mt-1 text-xs text-white/35">
                            {r.started_at
                              ? new Date(r.started_at).toLocaleString()
                              : "—"}
                          </p>
                        </div>
                      </div>
                      {expanded ? (
                        steps && steps.length > 0 ? (
                          <RuleExecutionSteps steps={steps} />
                        ) : (
                          <p className="mt-2 border-t border-white/[0.06] pt-3 text-xs text-white/40">
                            No per-step output stored for this run.
                          </p>
                        )
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </WorkspaceSurface>

          <MeetingPeoplePanel meetingId={id} />

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
