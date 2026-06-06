import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { Constellation } from "../../quest-on-glassbox/components/Constellation";
import { Timeline, WordReveal } from "../components";
import { COPY } from "../data";

// Cut 15 — 3.0s. Constellation + horizontal timeline + "보이게 합니다." 90 frames.
// v6 ★: copy switches from "보이게 한다." to "보이게 합니다." — runs in cadence
// with Cut 7 ("보이지 않습니다") for honorific symmetry.
export function Cut15(): ReactElement {
  const frame = useCurrentFrame();

  const dolly = interpolate(frame, [0, 90], [1.05, 0.92], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const tilt = interpolate(frame, [0, 90], [0, -2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse 80% 70% at 50% 55%, #061a2e 0%, #02060d 70%, #000 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${dolly}) rotateX(${tilt}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        <Constellation startFrame={-30} fadeOutStart={120} fadeOutDuration={1} />
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "18%",
          transform: "translateX(-50%)",
        }}
      >
        <Timeline startFrame={0} width={1280} ticks={12} />
      </div>

      <WordReveal
        words={COPY.cut15.words}
        startFrame={20}
        staggerFrames={6}
        wordDurationFrames={16}
        holdFrames={32}
        exitFrames={12}
        fontSize={COPY.cut15.fontSize}
        fontWeight={COPY.cut15.weight}
        gradient
      />
    </AbsoluteFill>
  );
}
