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

export const InsightsScene: React.FC = () => {
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

  const video1Delay = 12;
  const video1Entrance = spring({
    frame: Math.max(0, frame - video1Delay),
    fps,
    config: { damping: 18, stiffness: 150 },
    durationInFrames: 30,
  });
  const video1Opacity = interpolate(video1Entrance, [0, 1], [0, 1]);
  const video1Scale = interpolate(video1Entrance, [0, 1], [0.93, 1]);

  const video2Delay = 30;
  const video2Entrance = spring({
    frame: Math.max(0, frame - video2Delay),
    fps,
    config: { damping: 18, stiffness: 150 },
    durationInFrames: 30,
  });
  const video2Opacity = interpolate(video2Entrance, [0, 1], [0, 1]);
  const video2Scale = interpolate(video2Entrance, [0, 1], [0.93, 1]);

  const features = [
    { label: "Questions detected", color: colors.warning },
    { label: "Action items tracked", color: colors.accent },
    { label: "Decisions captured", color: colors.success },
    { label: "Chrome extension support", color: colors.textMuted },
  ];

  return (
    <AbsoluteFill>
      <GradientBg variant="accent" />

      {/* Headline at top */}
      <div
        style={{
          position: "absolute",
          top: 72,
          left: 0,
          right: 0,
          textAlign: "center",
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
          }}
        >
          Real-time insights,{" "}
          <span style={{ color: colors.warning }}>zero effort</span>
        </h2>
        <p
          style={{
            fontFamily: font,
            fontSize: 20,
            color: colors.textMuted,
            marginTop: 12,
          }}
        >
          Scribely detects what matters so you can stay focused on the conversation
        </p>
      </div>

      {/* Two videos + feature list */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          paddingTop: 80,
        }}
      >
        {/* Live meeting minimal — compact view, looped */}
        <div
          style={{
            opacity: video1Opacity,
            transform: `scale(${video1Scale})`,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: "0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <Video
            src={staticFile("clips_human/live_meeting_minimal.webm")}
            style={{ width: 520, height: "auto", display: "block" }}
            volume={0}
            loop
          />
        </div>

        {/* Settings video — fast-scroll 2x, first 7s */}
        <div
          style={{
            opacity: video2Opacity,
            transform: `scale(${video2Scale})`,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: "0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <Video
            src={staticFile("clips_human/settings.webm")}
            style={{ width: 520, height: "auto", display: "block" }}
            volume={0}
            playbackRate={2}
            trimAfter={7 * fps}
          />
        </div>

        {/* Feature checklist */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            flexShrink: 0,
          }}
        >
          {features.map(({ label, color }, i) => {
            const delay = 50 + i * 14;
            const entrance = spring({
              frame: Math.max(0, frame - delay),
              fps,
              config: { damping: 200 },
              durationInFrames: 20,
            });
            const opacity = interpolate(entrance, [0, 1], [0, 1]);
            const x = interpolate(entrance, [0, 1], [-18, 0]);

            return (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  opacity,
                  transform: `translateX(${x}px)`,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: `${color}22`,
                    border: `1.5px solid ${color}55`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                  >
                    <path
                      d="M20 6L9 17l-5-5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span
                  style={{
                    fontFamily: font,
                    fontSize: 17,
                    color: colors.text,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
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
