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

const ScribelyLogo: React.FC<{ scale: number; opacity: number }> = ({
  scale,
  opacity,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 18,
      opacity,
      transform: `scale(${scale})`,
    }}
  >
    <Img
      src={staticFile("app-icon.png")}
      width={80}
      height={80}
      style={{ borderRadius: 20, boxShadow: `0 0 50px rgba(122, 162, 247, 0.3)` }}
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
);

export const HeroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 180 },
    durationInFrames: 30,
  });

  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);
  const logoScale = interpolate(logoSpring, [0, 1], [0.7, 1]);

  const taglineDelay = 18;
  const taglineSpring = spring({
    frame: Math.max(0, frame - taglineDelay),
    fps,
    config: { damping: 200 },
    durationInFrames: 25,
  });
  const taglineOpacity = interpolate(taglineSpring, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineSpring, [0, 1], [20, 0]);

  const badgeDelay = 35;
  const badgeSpring = spring({
    frame: Math.max(0, frame - badgeDelay),
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });
  const badgeOpacity = interpolate(badgeSpring, [0, 1], [0, 1]);
  const badgeScale = interpolate(badgeSpring, [0, 1], [0.8, 1]);

  return (
    <AbsoluteFill>
      <GradientBg variant="hero" />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
        }}
      >
        <ScribelyLogo scale={logoScale} opacity={logoOpacity} />

        <div
          style={{
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: font,
              fontSize: 28,
              fontWeight: 500,
              color: colors.textMuted,
              margin: 0,
              letterSpacing: "0.01em",
            }}
          >
            Your AI meeting co-pilot
          </p>
        </div>

        <div
          style={{
            opacity: badgeOpacity,
            transform: `scale(${badgeScale})`,
            display: "flex",
            gap: 12,
            marginTop: 8,
          }}
        >
          {["macOS", "Local AI", "Private"].map((label) => (
            <div
              key={label}
              style={{
                backgroundColor: `${colors.accent}18`,
                border: `1px solid ${colors.accent}44`,
                borderRadius: 20,
                padding: "6px 16px",
                fontFamily: font,
                fontSize: 13,
                fontWeight: 600,
                color: colors.accent,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
