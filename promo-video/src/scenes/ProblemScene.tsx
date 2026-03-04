import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GradientBg } from "../components/GradientBg";
import { colors, font } from "../tokens";

const ProblemLine: React.FC<{
  text: string;
  delay: number;
  size?: number;
  weight?: number;
  color?: string;
}> = ({ text, delay, size = 52, weight = 700, color = colors.textBright }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = Math.max(0, frame - delay);

  const entrance = spring({
    frame: localFrame,
    fps,
    config: { damping: 200 },
    durationInFrames: 22,
  });

  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const translateY = interpolate(entrance, [0, 1], [30, 0]);

  return (
    <p
      style={{
        fontFamily: font,
        fontSize: size,
        fontWeight: weight,
        color,
        margin: 0,
        opacity,
        transform: `translateY(${translateY}px)`,
        lineHeight: 1.2,
      }}
    >
      {text}
    </p>
  );
};

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Strikethrough on "Notes are slow" — appears at frame 40
  const strikeProgress = interpolate(
    Math.max(0, frame - 40),
    [0, 15],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill>
      <GradientBg variant="default" />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: "0 120px",
          textAlign: "center",
        }}
      >
        <ProblemLine text="Meetings move fast." delay={0} size={58} />
        <div style={{ position: "relative", display: "inline-block" }}>
          <ProblemLine
            text="Notes fall behind."
            delay={18}
            size={58}
            color={colors.textMuted}
          />
          {/* Strikethrough line */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              height: 4,
              width: `${strikeProgress * 100}%`,
              backgroundColor: colors.error,
              borderRadius: 2,
              transform: "translateY(-50%)",
            }}
          />
        </div>
        <ProblemLine
          text="AI should help."
          delay={55}
          size={58}
          color={colors.accent}
        />

        <div style={{ marginTop: 32 }}>
          <ProblemLine
            text="Introducing Scribely."
            delay={80}
            size={28}
            weight={500}
            color={colors.textMuted}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
