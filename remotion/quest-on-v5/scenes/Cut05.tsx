import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4, CubeVariant } from "../components";

// Cut 5 — 1.5s. V4 exploded blueprint flash. 45f.
export function Cut05(): ReactElement {
  const frame = useCurrentFrame();

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

      <CubeVariant
        kind="V4-exploded"
        size={460}
        progress={Math.max(explode * (1 - reform), 0)}
      />
    </AbsoluteFill>
  );
}
