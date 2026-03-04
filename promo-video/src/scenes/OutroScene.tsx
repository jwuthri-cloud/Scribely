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
import { colors, font, radii } from "../tokens";

const Feature: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const x = interpolate(entrance, [0, 1], [-20, 0]);

  return (
    <div
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
          width: 18,
          height: 18,
          borderRadius: radii.full,
          backgroundColor: `${colors.success}22`,
          border: `1px solid ${colors.success}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="3">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span
        style={{
          fontFamily: font,
          fontSize: 16,
          color: colors.text,
          fontWeight: 500,
        }}
      >
        {text}
      </span>
    </div>
  );
};

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoEntrance = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 180 },
    durationInFrames: 30,
  });
  const logoScale = interpolate(logoEntrance, [0, 1], [0.6, 1]);
  const logoOpacity = interpolate(logoEntrance, [0, 1], [0, 1]);

  const ctaDelay = 30;
  const ctaEntrance = spring({
    frame: Math.max(0, frame - ctaDelay),
    fps,
    config: { damping: 200 },
    durationInFrames: 22,
  });
  const ctaOpacity = interpolate(ctaEntrance, [0, 1], [0, 1]);
  const ctaY = interpolate(ctaEntrance, [0, 1], [20, 0]);

  const features = [
    "Invisible to screen sharing — truly private",
    "100% local AI — no data leaves your Mac",
    "Live transcription + smart Q&A",
  ];

  return (
    <AbsoluteFill>
      <GradientBg variant="hero" />

      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.accent}12 0%, transparent 70%)`,
            opacity: logoOpacity,
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
        }}
      >
        {/* Logo — real app icon */}
        <div
          style={{
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <Img
            src={staticFile("app-icon.png")}
            width={88}
            height={88}
            style={{
              borderRadius: 22,
              boxShadow: `0 0 60px rgba(122, 162, 247, 0.35)`,
            }}
          />
          <span
            style={{
              fontFamily: font,
              fontSize: 72,
              fontWeight: 800,
              color: colors.textBright,
              letterSpacing: "-0.02em",
            }}
          >
            Scribely
          </span>
        </div>

        {/* CTA */}
        <div
          style={{
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
          }}
        >
          <p
            style={{
              fontFamily: font,
              fontSize: 22,
              color: colors.textMuted,
              margin: 0,
              textAlign: "center",
            }}
          >
            Your AI co-pilot for every meeting
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {features.map((f, i) => (
              <Feature key={f} text={f} delay={ctaDelay + 15 + i * 10} />
            ))}
          </div>

          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 14,
            }}
          >
            {[
              { label: "macOS", sublabel: "Free download", primary: true },
              { label: "Chrome Extension", sublabel: "Browser meetings", primary: false },
            ].map(({ label, sublabel, primary }) => (
              <div
                key={label}
                style={{
                  backgroundColor: primary ? colors.accent : colors.surfaceHover,
                  border: `1px solid ${primary ? colors.accent : colors.border}`,
                  borderRadius: 10,
                  padding: "12px 28px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: font,
                    fontSize: 16,
                    fontWeight: 700,
                    color: primary ? colors.bg : colors.textBright,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontFamily: font,
                    fontSize: 12,
                    color: primary ? `${colors.bg}aa` : colors.textMuted,
                  }}
                >
                  {sublabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
