import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { LightParticles } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 16 — 4.0s. Particles converge into the centre. 120 frames.
export function Cut16(): ReactElement {
  const frame = useCurrentFrame();

  const starFade = interpolate(frame, [0, 36], [1, 0.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const halo = interpolate(frame, [40, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse 80% 70% at 50% 50%, #02060d 0%, #000 70%)",
      }}
    >
      <div style={{ opacity: starFade }}>
        <LightParticles
          startFrame={-30}
          count={40}
          mode="drift"
          width={1920}
          height={1080}
          color={QUESTON_BRAND.primaryLight}
        />
      </div>

      <LightParticles
        startFrame={0}
        count={70}
        mode="converge"
        durationFrames={70}
        width={1920}
        height={1080}
        color={QUESTON_BRAND.primaryLight}
      />

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
          background: `radial-gradient(circle at 50% 50%, ${QUESTON_BRAND.primaryLight}55 0%, transparent 70%)`,
          opacity: halo,
          filter: "blur(20px)",
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
}
