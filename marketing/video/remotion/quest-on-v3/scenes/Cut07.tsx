import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2, WordReveal } from "../components";
import { COPY } from "../data";

// Cut 7 — 2.0s. Rapid push-in onto a single cube until surface fills frame.
// "보이지 않는다." centred. 60 frames.
export function Cut07(): ReactElement {
  const frame = useCurrentFrame();

  // Push-in: scale 1 -> 2.4
  const pushIn = interpolate(frame, [0, 60], [1, 2.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.expoOut,
  });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${pushIn})`,
        }}
      >
        <BoxV2 size={500} yawDeg={-12} pitchDeg={8} energy={0} noise={false} />
      </div>

      {/* Vignette darkens as we push in */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, transparent 30%, rgba(0,0,0,0.6) 100%)",
          pointerEvents: "none",
        }}
      />

      <WordReveal
        words={COPY.cut7.words}
        startFrame={6}
        staggerFrames={5}
        wordDurationFrames={14}
        holdFrames={26}
        exitFrames={10}
        fontSize={COPY.cut7.fontSize}
        fontWeight={COPY.cut7.weight}
        color="#f8fafc"
      />
    </AbsoluteFill>
  );
}
