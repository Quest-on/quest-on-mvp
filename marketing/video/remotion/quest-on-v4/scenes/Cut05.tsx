import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4 } from "../components/BoxV4";
import { CubeVariant } from "../components";

// Cut 5 — 1.5s. V4 exploded blueprint flash — 6 faces fly out exposing labels
// then snap back into a closed graphite cube. Sub-second variant beat to break monotony. 45f.
export function Cut05(): ReactElement {
  const frame = useCurrentFrame();

  // 0..18f: explode out. 18..30f: hold flash. 30..45f: snap back.
  const explode = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.expoOut,
  });
  const reform = interpolate(frame, [28, 44], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });

  // Underlying graphite cube energy fades up as faces snap back.
  const cubeEnergy = interpolate(frame, [28, 44], [0.18, 0.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cubeOp = interpolate(frame, [22, 36], [0.4, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #050a14 0%, #000 78%)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: cubeOp }}>
        <BoxV4 size={460} yawDeg={-22} pitchDeg={18} energy={cubeEnergy} />
      </div>

      {/* Exploded blueprint overlay */}
      <CubeVariant
        kind="V4-exploded"
        size={460}
        progress={Math.max(explode * (1 - reform), 0)}
      />
    </AbsoluteFill>
  );
}
