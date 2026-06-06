import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2 } from "../components";

// Cut 5 — 1.5s. Cube closes — surface paints over with matte graphite,
// internal energy drops to 0. Static. 45 frames.
export function Cut05(): ReactElement {
  const frame = useCurrentFrame();

  // Energy drops 0.4 -> 0 across first 24f.
  const energy = interpolate(frame, [0, 30], [0.45, 0.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });

  // Subtle internal vibration peeks through, fades out.
  const tremorScale = 1 + Math.sin(frame * 0.6) * 0.003 * (1 - frame / 45);

  // Paint-over: top to bottom dark veil descends across the cube briefly then disappears.
  const veil = interpolate(frame, [0, 18, 30], [0, 1, 0], {
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
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${tremorScale})`,
        }}
      >
        <BoxV2 size={460} yawDeg={-22} pitchDeg={18} energy={energy} />

        {/* Dark paint-over veil across centre cube */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 480,
            height: 480,
            marginLeft: -240,
            marginTop: -240,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(2,4,9,0.82) 60%, rgba(0,0,0,0.55) 100%)",
            opacity: veil * 0.5,
            mixBlendMode: "multiply",
            borderRadius: 14,
            pointerEvents: "none",
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
