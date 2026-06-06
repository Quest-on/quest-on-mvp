import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2, WordReveal } from "../components";
import { COPY } from "../data";

// Cut 11 — 2.5s. Graphite -> glass crystallise. Dutch tilt 25°. "그래서…" centred.
// 75 frames.
export function Cut11(): ReactElement {
  const frame = useCurrentFrame();

  const dutch = interpolate(frame, [0, 60], [0, 25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  const crystallise = interpolate(frame, [12, 65], [0, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });
  const energy = interpolate(frame, [0, 65], [0.15, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #061626 0%, #000 80%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `rotateZ(${dutch}deg)`,
        }}
      >
        <BoxV2
          size={460}
          yawDeg={-22}
          pitchDeg={18}
          energy={energy}
          crystallise={crystallise}
          surface={crystallise > 0.6 ? "glass" : "graphite"}
        />
      </div>

      <WordReveal
        words={COPY.cut11.words}
        startFrame={28}
        staggerFrames={4}
        wordDurationFrames={16}
        holdFrames={20}
        exitFrames={10}
        fontSize={COPY.cut11.fontSize}
        fontWeight={COPY.cut11.weight}
        color="#b6c5d6"
      />
    </AbsoluteFill>
  );
}
