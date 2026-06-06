import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4, CubeVariant, DomainLabel, InstructorPOV } from "../components";

// Cut 10 — 2.5s. Instructor POV + V3 cross-section. 75 frames.
// v6 ★: 강사 라벨 fade-in (Idea 3 — the decisive domain split).
// Different position (top-right) and hue (purple) from the 학생 label in Cut 3
// to make the POV switch unmistakable.
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

  const cs = interpolate(frame, [22, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const cubeOp = interpolate(frame, [22, 60], [1, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 60%, #050a14 0%, #000 80%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "55%",
          height: 0,
          opacity: cubeOp,
        }}
      >
        <BoxV4
          size={360}
          yawDeg={yaw}
          pitchDeg={20}
          energy={0.32}
          surface="glass"
          crystallise={1}
          scale={cubeScale}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "55%",
          height: 0,
        }}
      >
        <CubeVariant kind="V3-cross-section" size={360} progress={cs} />
      </div>

      <InstructorPOV startFrame={0} />

      {/* Domain label — instructor POV (visible 8..72 frames). */}
      <DomainLabel
        label="강사"
        position="top-right"
        startFrame={8}
        durationFrames={64}
        fadeFrames={12}
      />
    </AbsoluteFill>
  );
}
