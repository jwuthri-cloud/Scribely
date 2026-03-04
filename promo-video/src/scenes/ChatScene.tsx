import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GradientBg } from "../components/GradientBg";
import { colors, font } from "../tokens";

export const ChatScene: React.FC = () => {
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

  const imgDelay = 15;
  const imgEntrance = spring({
    frame: Math.max(0, frame - imgDelay),
    fps,
    config: { damping: 18, stiffness: 150 },
    durationInFrames: 30,
  });
  const imgOpacity = interpolate(imgEntrance, [0, 1], [0, 1]);
  const imgY = interpolate(imgEntrance, [0, 1], [28, 0]);

  // Callout boxes animate in after screenshot
  const callouts = [
    { delay: 50, label: "Transcript panel", color: colors.accent, x: -260, y: -60 },
    { delay: 65, label: "AI answer", color: colors.success, x: 0, y: -60 },
    { delay: 80, label: "Live Insights", color: colors.warning, x: 260, y: -60 },
  ];

  return (
    <AbsoluteFill>
      <GradientBg variant="hero" />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: "0 60px",
        }}
      >
        {/* Headline */}
        <div
          style={{
            opacity: headlineOpacity,
            transform: `translateY(${headlineY}px)`,
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontFamily: font,
              fontSize: 44,
              fontWeight: 800,
              color: colors.textBright,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Ask anything,{" "}
            <span style={{ color: colors.accent }}>get instant answers</span>
          </h2>
          <p
            style={{
              fontFamily: font,
              fontSize: 20,
              color: colors.textMuted,
              marginTop: 12,
            }}
          >
            Transcript · AI chat · Live Insights — all in one view
          </p>
        </div>

        {/* Full 3-panel landscape screenshot */}
        <div
          style={{
            position: "relative",
            opacity: imgOpacity,
            transform: `translateY(${imgY}px)`,
          }}
        >
          <div
            style={{
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 32px 90px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)",
            }}
          >
            <Img
              src={staticFile("clips_human/in_meeting_transcript_insight.png")}
              style={{ width: 1400, height: "auto", display: "block" }}
            />
          </div>

          {/* Callout labels */}
          {callouts.map(({ delay, label, color, x, y }) => {
            const entrance = spring({
              frame: Math.max(0, frame - delay),
              fps,
              config: { damping: 200 },
              durationInFrames: 18,
            });
            const op = interpolate(entrance, [0, 1], [0, 1]);
            const sc = interpolate(entrance, [0, 1], [0.7, 1]);
            return (
              <div
                key={label}
                style={{
                  position: "absolute",
                  bottom: -44,
                  left: "50%",
                  transform: `translateX(calc(-50% + ${x}px)) scale(${sc})`,
                  opacity: op,
                  backgroundColor: `${color}22`,
                  border: `1.5px solid ${color}66`,
                  borderRadius: 8,
                  padding: "5px 14px",
                }}
              >
                <span
                  style={{
                    fontFamily: font,
                    fontSize: 13,
                    fontWeight: 600,
                    color,
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
