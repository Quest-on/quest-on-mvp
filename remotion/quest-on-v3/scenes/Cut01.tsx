import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";

// Cut 1 — 1.5s. Pitch black with single 1px pulsing point at centre.
// Three breath pulses. Static camera.
export function Cut01(): ReactElement {
  const frame = useCurrentFrame();

  // Three pulses across 45 frames, each ~15f.
  const pulseT = (frame % 15) / 15;
  const pulse = Math.sin(pulseT * Math.PI);

  const fadeIn = interpolate(frame, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  const size = 2 + pulse * 5;
  const glowSize = 12 + pulse * 36;
  const opacity = 0.5 + pulse * 0.45;

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: `0 0 ${glowSize}px rgba(34,211,238,${opacity * 0.8}), 0 0 ${glowSize * 2}px rgba(34,211,238,${opacity * 0.4})`,
          opacity: opacity * fadeIn,
        }}
      />
    </AbsoluteFill>
  );
}
