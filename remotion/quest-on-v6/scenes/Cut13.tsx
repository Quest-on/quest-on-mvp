import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import {
  BoxV4,
  InstructorGradeMock,
  LightParticles,
  StudentExamMock,
} from "../components";
import { QUESTON_BRAND } from "../brand";

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

  const iridescent = interpolate(frame, [10, 32, 55], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });

  const dive = interpolate(frame, [50, 90], [1, 4.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.expoOut,
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
        <BoxV4
          size={520}
          yawDeg={0}
          pitchDeg={0}
          surface="glass"
          crystallise={1}
          energy={0.65}
          iridescent={iridescent}
          frontFace={
            <div
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                background: "#FAFAFA",
                display: "grid",
                placeItems: "center",
              }}
            >
              <div
                style={{
                  width: 1920,
                  height: 1080,
                  transform: "scale(0.34)",
                  transformOrigin: "center",
                }}
              >
                <StudentExamMock compact />
              </div>
            </div>
          }
        />
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
              transform: "scale(0.86)",
              transformOrigin: "center",
            }}
          >
            <InstructorGradeMock />
          </div>
        </div>
      </div>

      {frame >= 14 && frame <= 60 ? (
        <LightParticles
          startFrame={14}
          count={36}
          mode="drift"
          width={1920}
          height={1080}
          color={QUESTON_BRAND.primaryLight}
        />
      ) : null}

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
