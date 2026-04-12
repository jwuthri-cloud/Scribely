"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, FileJson, FileText, Printer } from "lucide-react"
import type { MeetingExportDocument } from "@/lib/meeting-export"
import {
  buildMeetingJson,
  buildMeetingMarkdown,
  meetingExportBasename,
  openMeetingPrintDialog,
  triggerTextDownload,
} from "@/lib/meeting-export"
import { cn } from "@/lib/utils"

export function MeetingExportMenu({
  doc,
  className,
}: {
  doc: MeetingExportDocument
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const base = meetingExportBasename(doc.title, doc.meetingId)

  const downloadMd = () => {
    const body = buildMeetingMarkdown(doc)
    triggerTextDownload(`${base}.md`, "text/markdown;charset=utf-8", body)
    setOpen(false)
  }

  const downloadJson = () => {
    const body = buildMeetingJson(doc)
    triggerTextDownload(`${base}.json`, "application/json;charset=utf-8", body)
    setOpen(false)
  }

  const printPdf = () => {
    openMeetingPrintDialog(doc)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-full min-h-[2.25rem] w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-left text-[11px] font-medium text-white/75 transition-colors hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white/90 sm:min-h-0 sm:w-auto sm:justify-start sm:text-xs"
      >
        <span>Export</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 opacity-70 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[12rem] overflow-hidden rounded-xl border border-white/[0.1] bg-zinc-950/95 py-1 shadow-xl shadow-black/40 backdrop-blur-md sm:left-auto sm:right-0"
        >
          <button
            type="button"
            role="menuitem"
            onClick={downloadMd}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-white/90 transition-colors hover:bg-white/[0.06]"
          >
            <FileText className="h-4 w-4 shrink-0 text-violet-300/90" />
            <span>Markdown (.md)</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={downloadJson}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-white/90 transition-colors hover:bg-white/[0.06]"
          >
            <FileJson className="h-4 w-4 shrink-0 text-cyan-300/90" />
            <span>JSON (.json)</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={printPdf}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-white/90 transition-colors hover:bg-white/[0.06]"
          >
            <Printer className="h-4 w-4 shrink-0 text-fuchsia-300/85" />
            <span className="flex flex-col leading-tight">
              <span>PDF (print…)</span>
              <span className="text-[10px] font-normal text-white/40">Save as PDF in the dialog</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
