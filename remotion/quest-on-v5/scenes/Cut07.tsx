import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4, WordReveal } from "../components";
import { COPY } from "../data";

// Cut 7 — 2.0s. Push-in + "보이지 않는다." 60 frames.
// Stall fix: cube yaw drifts across whole cut.
export function Cut07(): ReactElement {
  const frame = useCurrentFrame();

  const pushIn = interpolate(frame, [0, 60], [1, 2.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.expoOut,
  });
  const yaw = interpolate(frame, [0, 60], [-12, -6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${pushIn})` }}>
        <BoxV4 size={500} yawDeg={yaw} pitchDeg={8} energy={0} noise={false} />
      </div>

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
