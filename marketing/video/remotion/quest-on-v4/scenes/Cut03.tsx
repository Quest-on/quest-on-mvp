import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4 } from "../components/BoxV4";
import { CubeVariant } from "../components";
import { HandSilhouette } from "../../quest-on-v3/components";
import { QUESTON_BRAND } from "../brand";

// Cut 3 — 2.5s. Wireframe solidifies into graphite cube; hand from bottom; key pulse.
// Camera continues the slight push-in started in Cut 02 to avoid hard breaks. 75 frames.
export function Cut03(): ReactElement {
  const frame = useCurrentFrame();

  // Continue push-in (Cut 02 ended at 1.05; Cut 03 goes 1.05 -> 1.10 across the cut).
  const pushIn = interpolate(frame, [0, 75], [1.05, 1.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const tilt = interpolate(frame, [0, 75], [0, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Wireframe -> solid morph. Wireframe holds 100% then fades to make room for graphite.
  const wireOpacity = interpolate(frame, [0, 30], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const cubeReveal = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  const handY = interpolate(frame, [12, 48], [220, 90], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const pulseT = interpolate(frame, [50, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.expoOut,
  });
  const pulseFade = interpolate(frame, [56, 70], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cubeEnergy = 0.18 + pulseT * pulseFade * 0.45;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #060d1c 0%, #000 78%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${pushIn}) rotateX(${tilt}deg)`,
        }}
      >
        {/* Wireframe fading out */}
        <div style={{ opacity: wireOpacity }}>
          <CubeVariant kind="V1-wireframe" size={460} progress={1} />
        </div>
        {/* Solid cube emerging */}
        <div style={{ opacity: cubeReveal }}>
          <BoxV4 size={460} yawDeg={-22} pitchDeg={18} energy={cubeEnergy} />
        </div>

        {/* Hand from bottom */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 0,
            transform: `translate(-50%, ${handY}px)`,
          }}
        >
          <HandSilhouette
            width={620}
            height={420}
            withKeyboard
            opacity={0.94}
            rim={QUESTON_BRAND.primaryLight}
          />
        </div>

        {/* Key pulse — single light pulse moving from keyboard up to cube */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: `${85 - pulseT * 35}%`,
            width: 8 + pulseT * 18,
            height: 8 + pulseT * 18,
            marginLeft: -(8 + pulseT * 18) / 2,
            borderRadius: "50%",
            background: QUESTON_BRAND.primaryLight,
            boxShadow: `0 0 18px ${QUESTON_BRAND.primaryLight}, 0 0 60px ${QUESTON_BRAND.primary}`,
            opacity: pulseT * pulseFade,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
