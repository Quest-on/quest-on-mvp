import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { CubeVariant, ThreeCube } from "../components";

// Cut 5 — 1.5s. V4 exploded blueprint flash. 45f.
export function Cut05(): ReactElement {
  const frame = useCurrentFrame();

  const explode = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.expoOut,
  });
  const reform = interpolate(frame, [28, 44], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });

  // iter 16 motion fix — boost cubeEnergy floor + earlier cubeOp ramp so the
  // exploded blueprint is legibly bright instead of barely-visible silhouette.
  // iter 22 — graphite ThreeCube was now too punchy after lighting boost,
  // it ate the V4-exploded blueprint. Hold ThreeCube near zero during the
  // explode beat (frame 0..22) so the wireframe blueprint reads as the
  // primary subject; only reveal the solid cube as it reforms.
  const cubeEnergy = interpolate(frame, [28, 44], [0.18, 0.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cubeOp = interpolate(frame, [22, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  // iter 16 motion fix — radial flash at the explode moment so the cut has
  // a visible kinetic event when snapshotted, not just a dark silhouette.
  const flash = interpolate(frame, [4, 14, 28], [0, 0.7, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #060f1f 0%, #000 78%)",
      }}
    >
      {/* iter4 — bigger background cube (460→500) for more presence. */}
      <div style={{ position: "absolute", inset: 0, opacity: cubeOp }}>
        <ThreeCube size={500} yawDeg={-22} pitchDeg={18} energy={cubeEnergy} />
      </div>

      {/* iter4 — exploded blueprint size 460→560 to fill more frame. */}
      <CubeVariant
        kind="V4-exploded"
        size={560}
        progress={Math.max(explode * (1 - reform), 0)}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(99,179,237,0.55) 0%, rgba(53,89,196,0.18) 30%, transparent 70%)",
          opacity: flash,
          mixBlendMode: "screen",
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
}
