import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4 } from "../components/BoxV4";
import { LightParticles, ProductMockupSurface } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 13 — 3.0s. UI -> back to cube. The dashboard zooms out and reveals it
// was always living on the front face of a glass cube. V6 iridescent peak fires
// for ~1.5s only (frames 10..55). Camera dive completes through the cube.
// 90 frames.
export function Cut13(): ReactElement {
  const frame = useCurrentFrame();

  // First half: UI panel shrinks to fit the cube's front face. Second half: dive.
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

  // V6 iridescent peak window: 10..55 (1.5s).
  const iridescent = interpolate(frame, [10, 32, 55], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });

  // Dive after frame 50.
  const dive = interpolate(frame, [50, 90], [1, 4.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.expoOut,
  });

  // Final ~10f goes to white flash to seed Cut 14 dive.
  const flashOp = frame >= 78 && frame <= 80 ? 1 : 0;

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* Cube emerging behind the shrinking UI */}
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
            <ProductMockupSurface startFrame={-30} variant="student-exam" />
          }
        />
      </div>

      {/* Shrinking UI residue — overlaid in the centre as the cube settles */}
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
        }}
      >
        <ProductMockupSurface startFrame={-50} variant="instructor-grade" />
      </div>

      {/* Cobalt sparkle particles during iridescent peak */}
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
