import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2, HandSilhouette } from "../components";

// Cut 3 — 2.5s. Floating cube + hand from bottom + key pulse into cube.
// Tilt down 4°. 75 frames.
export function Cut03(): ReactElement {
  const frame = useCurrentFrame();

  const tilt = interpolate(frame, [0, 75], [0, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  const handY = interpolate(frame, [0, 36], [220, 90], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Key pulse (single signal towards cube) at frame 50..62.
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
          transform: `rotateX(${tilt}deg)`,
        }}
      >
        <BoxV2 size={460} yawDeg={-22} pitchDeg={18} energy={cubeEnergy} />

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
            background: "rgba(34,211,238,0.95)",
            boxShadow:
              "0 0 18px rgba(34,211,238,0.8), 0 0 60px rgba(34,211,238,0.6)",
            opacity: pulseT * pulseFade,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
