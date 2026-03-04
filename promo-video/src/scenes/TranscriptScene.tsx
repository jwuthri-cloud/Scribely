import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
import { GradientBg } from "../components/GradientBg";
import { colors, font } from "../tokens";

export const TranscriptScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineEntrance = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 22,
  });
  const headlineOpacity = interpolate(headlineEntrance, [0, 1], [0, 1]);
  const headlineY = interpolate(headlineEntrance, [0, 1], [16, 0]);

  const videoDelay = 12;
  const videoEntrance = spring({
    frame: Math.max(0, frame - videoDelay),
    fps,
    config: { damping: 18, stiffness: 150 },
    durationInFrames: 30,
  });
  const videoOpacity = interpolate(videoEntrance, [0, 1], [0, 1]);
  const videoScale = interpolate(videoEntrance, [0, 1], [0.93, 1]);

  const pillDelay = 50;
  const pillEntrance = spring({
    frame: Math.max(0, frame - pillDelay),
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });
  const pillOpacity = interpolate(pillEntrance, [0, 1], [0, 1]);

  return (
    <AbsoluteFill>
      <GradientBg variant="accent" />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 72,
          padding: "0 100px",
        }}
      >
        {/* Text column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxWidth: 500,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              opacity: headlineOpacity,
              transform: `translateY(${headlineY}px)`,
            }}
          >
            <h2
              style={{
                fontFamily: font,
                fontSize: 46,
                fontWeight: 800,
                color: colors.textBright,
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              Live transcription,{" "}
              <span style={{ color: colors.accent }}>100% local</span>
            </h2>
            <p
              style={{
                fontFamily: font,
                fontSize: 20,
                color: colors.textMuted,
                marginTop: 14,
                lineHeight: 1.5,
              }}
            >
              On-device Whisper — your words never leave your Mac.
            </p>
          </div>

          {/* Stats pills */}
          <div
            style={{
              opacity: pillOpacity,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 8,
            }}
          >
            {[
              { label: "Whisper large-v3 turbo", sub: "local model" },
              { label: "Multi-speaker detection", sub: "MIC vs SYS" },
              { label: "No internet required", sub: "fully offline" },
            ].map(({ label, sub }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: `${colors.surface}cc`,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  padding: "10px 16px",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: font,
                    fontSize: 15,
                    fontWeight: 600,
                    color: colors.textBright,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontFamily: font,
                    fontSize: 12,
                    color: colors.accent,
                    fontWeight: 500,
                    backgroundColor: `${colors.accent}18`,
                    border: `1px solid ${colors.accent}44`,
                    borderRadius: 6,
                    padding: "2px 8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sub}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Live meeting video — trimmed to 8s */}
        <div
          style={{
            opacity: videoOpacity,
            transform: `scale(${videoScale})`,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <Video
            src={staticFile("clips_human/live_meeting.webm")}
            style={{ width: 680, height: "auto", display: "block" }}
            volume={0}
            trimAfter={8 * fps}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
