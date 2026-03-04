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

export const OverlayScene: React.FC = () => {
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

  const imgDelay = 12;
  const imgEntrance = spring({
    frame: Math.max(0, frame - imgDelay),
    fps,
    config: { damping: 18, stiffness: 150 },
    durationInFrames: 30,
  });
  const imgOpacity = interpolate(imgEntrance, [0, 1], [0, 1]);
  const imgScale = interpolate(imgEntrance, [0, 1], [0.93, 1]);

  const badgeDelay = 45;
  const badgeEntrance = spring({
    frame: Math.max(0, frame - badgeDelay),
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });
  const badgeOpacity = interpolate(badgeEntrance, [0, 1], [0, 1]);
  const badgeScale = interpolate(badgeEntrance, [0, 1], [0.8, 1]);

  return (
    <AbsoluteFill>
      <GradientBg variant="default" />

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
        {/* Real app screenshot — compact meeting view */}
        <div
          style={{
            opacity: imgOpacity,
            transform: `scale(${imgScale})`,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <Img
            src={staticFile("clips_human/in_meeting_minimal.png")}
            style={{ width: 520, height: "auto", display: "block" }}
          />
        </div>

        {/* Text column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxWidth: 560,
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
              A floating overlay only{" "}
              <span style={{ color: colors.accent }}>you</span> can see
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
              Sits above all windows, invisible to screen sharing and recording tools.
            </p>
          </div>

          {/* Feature badges */}
          <div
            style={{
              opacity: badgeOpacity,
              transform: `scale(${badgeScale})`,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 8,
            }}
          >
            {[
              { icon: "👁", label: "Hidden from screen share" },
              { icon: "📌", label: "Always on top" },
              { icon: "🔒", label: "100% local — no cloud" },
            ].map(({ icon, label }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: `${colors.success}12`,
                  border: `1px solid ${colors.success}40`,
                  borderRadius: 10,
                  padding: "8px 16px",
                  width: "fit-content",
                }}
              >
                <span style={{ fontSize: 16 }}>{icon}</span>
                <span
                  style={{
                    fontFamily: font,
                    fontSize: 15,
                    fontWeight: 600,
                    color: colors.success,
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
