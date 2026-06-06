import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2, TextStream, WordReveal } from "../components";
import { COPY } from "../data";

// Cut 4 — 2.5s. Code-editor stream on left + cube + "AI를 쓴다." centre.
// Static, slight parallax. 75 frames.
export function Cut04(): ReactElement {
  const frame = useCurrentFrame();
  const parallax = Math.sin(frame * 0.025) * 6;

  // Stream pulled toward cube — apply skew for "drag" feel.
  const streamPull = interpolate(frame, [10, 70], [0, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 60% 50%, #050b18 0%, #000 78%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 200,
          top: 280,
          transform: `translate(${parallax}px, 0px) skewY(${streamPull * 0.06}deg)`,
        }}
      >
        <TextStream startFrame={0} width={420} height={520} />
      </div>

      {/* Cube on right side */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${260 - parallax * 0.3}px)`,
        }}
      >
        <BoxV2 size={440} yawDeg={-22} pitchDeg={18} energy={0.22} />
      </div>

      {/* "AI를 쓴다." centred copy — appears at frame 14, holds, exits */}
      <WordReveal
        words={COPY.cut4.words}
        startFrame={14}
        staggerFrames={5}
        wordDurationFrames={14}
        holdFrames={32}
        exitFrames={14}
        fontSize={COPY.cut4.fontSize}
        fontWeight={COPY.cut4.weight}
        color="#b6c5d6"
      />
    </AbsoluteFill>
  );
}
