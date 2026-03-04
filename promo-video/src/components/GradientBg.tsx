import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { colors } from "../tokens";

export const GradientBg: React.FC<{ variant?: "default" | "hero" | "accent" }> = ({
  variant = "default",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const shimmer = interpolate(frame, [0, 4 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  const gradients: Record<string, string> = {
    default: `radial-gradient(ellipse at 20% 50%, #1e2040 0%, ${colors.bg} 60%)`,
    hero: `radial-gradient(ellipse at 50% 40%, #1e2545 0%, ${colors.bg} 70%)`,
    accent: `radial-gradient(ellipse at 70% 30%, #1e2540 0%, ${colors.bg} 65%)`,
  };

  return (
    <AbsoluteFill
      style={{
        background: gradients[variant],
      }}
    >
      {/* Subtle grid overlay */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${colors.border}18 1px, transparent 1px), linear-gradient(90deg, ${colors.border}18 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          opacity: shimmer * 0.4,
        }}
      />
    </AbsoluteFill>
  );
};
