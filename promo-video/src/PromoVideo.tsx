import React from "react";
import { useVideoConfig } from "remotion";
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { HeroScene } from "./scenes/HeroScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { OverlayScene } from "./scenes/OverlayScene";
import { ChatScene } from "./scenes/ChatScene";
import { TranscriptScene } from "./scenes/TranscriptScene";
import { InsightsScene } from "./scenes/InsightsScene";
import { OutroScene } from "./scenes/OutroScene";

// Scene durations in seconds
const DURATIONS = {
  hero: 4,       // logo + tagline entrance
  problem: 5,    // text-only problem statement
  overlay: 6,    // compact meeting screenshot
  chat: 7,       // 3-panel landscape screenshot
  transcript: 8, // live_meeting.webm trimmed to 8s
  insights: 7,   // live_meeting_minimal (looped) + settings fast-scroll
  outro: 5,      // CTA + feature list (shortened)
};

// Transition duration in frames
const T = 20;

export const PromoVideo: React.FC = () => {
  const { fps } = useVideoConfig();
  const s = (sec: number) => Math.round(sec * fps);

  const fadeT = linearTiming({ durationInFrames: T });
  const slideT = springTiming({ config: { damping: 200 }, durationInFrames: T });
  const wipeT = linearTiming({ durationInFrames: T });

  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={s(DURATIONS.hero)}>
        <HeroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

      <TransitionSeries.Sequence durationInFrames={s(DURATIONS.problem)}>
        <ProblemScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={slideT}
      />

      <TransitionSeries.Sequence durationInFrames={s(DURATIONS.overlay)}>
        <OverlayScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-left" })}
        timing={wipeT}
      />

      <TransitionSeries.Sequence durationInFrames={s(DURATIONS.chat)}>
        <ChatScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

      <TransitionSeries.Sequence durationInFrames={s(DURATIONS.transcript)}>
        <TranscriptScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-left" })}
        timing={slideT}
      />

      <TransitionSeries.Sequence durationInFrames={s(DURATIONS.insights)}>
        <InsightsScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

      <TransitionSeries.Sequence durationInFrames={s(DURATIONS.outro)}>
        <OutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};

// (4+5+6+7+8+7+5)*30 - 6*20 = 42*30 - 120 = 1260 - 120 = 1140
export const TOTAL_DURATION_IN_FRAMES = 1140;
