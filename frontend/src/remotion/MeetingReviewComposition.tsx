"use client"

import { AbsoluteFill, Video, useCurrentFrame, useVideoConfig } from "remotion"

export type CaptionSegment = {
  startSec: number
  endSec: number
  speaker: string
  text: string
}

function pickCaption(captions: CaptionSegment[], t: number): CaptionSegment | null {
  for (const c of captions) {
    if (t >= c.startSec && t < c.endSec) return c
  }
  let last: CaptionSegment | null = null
  for (const c of captions) {
    if (c.startSec <= t) last = c
  }
  return last
}

/** Remotion scene: full-frame WebM + synced transcript overlay (used via `@remotion/player`). */
export function MeetingReviewComposition({
  videoSrc,
  captions,
}: {
  videoSrc: string
  captions: CaptionSegment[]
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const cap = captions.length ? pickCaption(captions, t) : null

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Video
        src={videoSrc}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
      {cap ? (
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            bottom: 24,
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(0,0,0,0.72)",
            color: "#fff",
            fontFamily: "system-ui, sans-serif",
            fontSize: 15,
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 6 }}>{cap.speaker}</div>
          <div>{cap.text || "—"}</div>
        </div>
      ) : null}
    </AbsoluteFill>
  )
}
