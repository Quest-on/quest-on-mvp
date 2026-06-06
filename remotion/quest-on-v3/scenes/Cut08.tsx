import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2, OrganicCrack } from "../components";

// Cut 8 — 3.0s. Crack starts at impact point, fractal branching, debris.
// Slight 2° dolly. 90 frames.
export function Cut08(): ReactElement {
  const frame = useCurrentFrame();

  const dolly = interpolate(frame, [0, 90], [1, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Light leak fills atmospherically.
  const leakOp = interpolate(frame, [10, 75], [0, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #050a14 0%, #000 78%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${dolly})`,
        }}
      >
        <BoxV2 size={480} yawDeg={-22} pitchDeg={18} energy={0.05} />

        {/* Crack overlay positioned over front face */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 480,
            height: 480,
            marginLeft: -240,
            marginTop: -240,
            transform: "translateZ(240px) rotateY(-22deg) rotateX(18deg)",
          }}
        >
          <OrganicCrack startFrame={0} width={480} height={480} />
        </div>
      </div>

      {/* Cyan tint leak across whole frame */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 50% 40% at 45% 38%, rgba(34,211,238,0.18), transparent 70%)",
          opacity: leakOp,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
}
