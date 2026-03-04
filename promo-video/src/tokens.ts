import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const font = fontFamily;
export const monoFont = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace";

export const colors = {
  bg: "#1a1b26",
  surface: "#1e2030",
  surfaceHover: "#24283b",
  border: "#2f3348",
  text: "#a9b1d6",
  textMuted: "#565f89",
  textBright: "#c0caf5",
  accent: "#7aa2f7",
  accentHover: "#6690e6",
  success: "#9ece6a",
  warning: "#e0af68",
  error: "#f7768e",
  inputBg: "#16161e",
  inputBorder: "#2f3348",
  chipBg: "#24283b",
  chipText: "#a9b1d6",
};

export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  "2xl": 16,
  full: 9999,
};
