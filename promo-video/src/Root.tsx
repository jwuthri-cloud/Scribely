import React from "react";
import { Composition } from "remotion";
import { PromoVideo, TOTAL_DURATION_IN_FRAMES } from "./PromoVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="PromoVideo"
      component={PromoVideo}
      durationInFrames={TOTAL_DURATION_IN_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
