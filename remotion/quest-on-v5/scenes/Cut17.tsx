import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { LightParticles, QuestOnLogo } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 17 — 4.0s. Quest-On logo SVG reveal — stroke draw + gradient fill.
// Tightened from v4's 6s. Halo bloom + drifting particles run all 120 frames so the
// post-fill window is never dead.
export function Cut17(): ReactElement {
  const frame = useCurrentFrame();

  // Particle residue stays alive but breathes.
  const residual = interpolate(frame, [0, 120], [0.32, 0.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Halo grows during draw, then breathes (sin) so post-draw frames are not flat.
  const haloBase = interpolate(frame, [0, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const haloBreath = haloBase + 0.12 * Math.sin(frame * 0.12);

  // Slow camera drift across the whole cut.
  const drift = interpolate(frame, [0, 120], [1.0, 1.04], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div style={{ opacity: residual }}>
        <LightParticles
          startFrame={-50}
          count={28}
          mode="drift"
          width={1920}
          height={1080}
          color={QUESTON_BRAND.primaryLight}
        />
      </div>

      {/* Cobalt halo behind the logo — breathes with sin, never dead */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 720,
          height: 720,
          marginLeft: -360,
          marginTop: -360,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 50%, ${QUESTON_BRAND.primaryLight}3D 0%, transparent 70%)`,
          opacity: Math.max(0, Math.min(1, haloBreath)),
          filter: "blur(40px)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "absolute", inset: 0, transform: `scale(${drift})` }}>
        <QuestOnLogo
          size={240}
          startFrame={0}
          durationFrames={70}
          iconOnly
        />
      </div>
    </AbsoluteFill>
  );
}
