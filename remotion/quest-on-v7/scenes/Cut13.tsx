import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import {
  InstructorGradeMock,
  StudentExamMock,
  ThreeCube,
} from "../components";

// Cut 13 — 3.0s. UI -> back to cube + V6 iridescent peak. 90 frames.
// v6 ★: PNG RealUIScreen replaced with inline StudentExamMock + InstructorGradeMock.
export function Cut13(): ReactElement {
  const frame = useCurrentFrame();

  const settle = interpolate(frame, [0, 30], [1.0, 0.36], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });
  const cubeOp = interpolate(frame, [4, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Iridescent peak now caps at 0.55 — anything higher washes the cube to
  // solid white and reads like a glowing brick instead of a transparent
  // crystal. Lower ceiling preserves "glassbox" legibility (iter 13 fix).
  const iridescent = interpolate(frame, [10, 32, 55], [0, 0.55, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });

  // Front face fades inversely with iridescent so the cube's spectral shift
  // is visible.
  const frontFaceOpacity = 1 - iridescent;

  const dive = interpolate(frame, [50, 90], [1, 2.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.expoOut,
  });

  // The product UI must read as a centered screen, not as a cropped texture.
  // Let the cube perform the late dive while the UI exits before that zoom
  // would push the screen edges out of frame.
  const screenExitOpacity = interpolate(frame, [48, 64], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });
  const screenScale = interpolate(frame, [0, 48, 64], [1, 1, 0.94], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });

  const flashOp = frame >= 78 && frame <= 80 ? 1 : 0;

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: cubeOp,
          transform: `scale(${dive})`,
        }}
      >
        <ThreeCube
          size={920}
          yawDeg={0}
          pitchDeg={0}
          surface="glass"
          crystallise={1}
          energy={0.65}
          iridescent={iridescent}
          bloom={iridescent * 1.2}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 920,
          height: 518,
          marginLeft: -460,
          marginTop: -259,
          transform: `scale(${screenScale})`,
          transformOrigin: "center center",
          opacity: cubeOp * frontFaceOpacity * screenExitOpacity,
          pointerEvents: "none",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
        }}
      >
        <div
          style={{
            width: 1920,
            height: 1080,
            transform: "scale(0.479)",
            transformOrigin: "top left",
          }}
        >
          <StudentExamMock compact streaming startFrame={-100} showAnswerTyping={false} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 1680,
          height: 920,
          marginLeft: -840,
          marginTop: -460,
          transform: `scale(${settle})`,
          transformOrigin: "center",
          pointerEvents: "none",
          opacity: 1 - cubeOp,
          borderRadius: 18,
          overflow: "hidden",
          boxShadow:
            "0 60px 120px -20px rgba(53,89,196,0.35), 0 30px 80px -20px rgba(0,0,0,0.7)",
          background: "#FAFAFA",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              width: 1920,
              height: 1080,
              transform: "scale(0.85)",
              transformOrigin: "center",
            }}
          >
            <InstructorGradeMock />
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#fff",
          opacity: flashOp,
        }}
      />
    </AbsoluteFill>
  );
}
