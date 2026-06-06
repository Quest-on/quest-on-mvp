import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";

// Cut 1 — 1.5s. Pulsing cobalt point. Continuous breath via sine; no dead frames.
export function Cut01(): ReactElement {
  const frame = useCurrentFrame();

  const pulseT = (frame % 15) / 15;
  const pulse = Math.sin(pulseT * Math.PI);

  const fadeIn = interpolate(frame, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // iter 20 wow fix — boost the "expectant point" so the cold open has
  // visible presence and isn't a near-black still. Bigger core + radial halo
  // ring that breathes with the same pulse.
  // iter3 — amplify breathing (9→15), glow (64→100), halo (0.55→0.85).
  // iter4 — base size 4→8, amplitude 15→20, glow base 24→36 + amp 100→130,
  //         halo base 0.32→0.45 so the cold open reads at any pulse phase.
  const size = 8 + pulse * 20;
  const glowSize = 36 + pulse * 130;
  const opacity = 0.6 + pulse * 0.4;
  const haloPulse = 0.45 + pulse * 0.85;

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
        }}
      >
        {/* iter 20 — soft halo ring around the point so it has presence. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 360,
            height: 360,
            marginLeft: -180,
            marginTop: -180,
            borderRadius: "50%",
            background: `radial-gradient(circle at 50% 50%, ${QUESTON_BRAND.primaryLight}55 0%, ${QUESTON_BRAND.primary}1A 35%, transparent 70%)`,
            opacity: haloPulse * fadeIn,
            filter: "blur(40px)",
            mixBlendMode: "screen",
          }}
        />
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
      </div>
    </AbsoluteFill>
  );
}
