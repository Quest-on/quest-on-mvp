import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";

// Cut 1 — 1.5s. Pitch black with pulsing cobalt point at centre.
// Three breath pulses. 45 frames.
export function Cut01(): ReactElement {
  const frame = useCurrentFrame();

  const pulseT = (frame % 15) / 15;
  const pulse = Math.sin(pulseT * Math.PI);

  const fadeIn = interpolate(frame, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  const size = 2 + pulse * 5;
  const glowSize = 14 + pulse * 38;
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
          boxShadow: `0 0 ${glowSize}px ${QUESTON_BRAND.primaryLight}, 0 0 ${glowSize * 2}px ${QUESTON_BRAND.primary}`,
          opacity: opacity * fadeIn,
        }}
      />
    </AbsoluteFill>
  );
}
