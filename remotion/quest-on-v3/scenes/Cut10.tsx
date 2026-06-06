import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2, InstructorPOV } from "../components";

// Cut 10 — 2.5s. Instructor POV — large hand peers at the cube from above.
// Cube yaws 12°. 75 frames.
export function Cut10(): ReactElement {
  const frame = useCurrentFrame();

  const yaw = interpolate(frame, [0, 75], [-22, -10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const cubeScale = interpolate(frame, [0, 30], [1.0, 0.78], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 60%, #050a14 0%, #000 80%)",
      }}
    >
      {/* Cube — bottom-centre, smaller (instructor scale) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "55%",
          height: 0,
        }}
      >
        <BoxV2
          size={360}
          yawDeg={yaw}
          pitchDeg={20}
          energy={0.18}
          scale={cubeScale}
        />
      </div>

      <InstructorPOV startFrame={0} />
    </AbsoluteFill>
  );
}
