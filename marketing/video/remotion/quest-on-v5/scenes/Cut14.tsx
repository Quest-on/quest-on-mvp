import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { Constellation } from "../../quest-on-glassbox/components/Constellation";
import { LightParticles } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 14 — 3.0s. V8 constellation. 90 frames.
export function Cut14(): ReactElement {
  const frame = useCurrentFrame();
  const yaw = interpolate(frame, [0, 90], [0, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse 80% 70% at 50% 50%, #061a2e 0%, #02060d 60%, #000 100%)",
      }}
    >
      <LightParticles
        startFrame={0}
        count={50}
        mode="drift"
        width={1920}
        height={1080}
        color={QUESTON_BRAND.primaryLight}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `perspective(1200px) rotateY(${yaw}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        <Constellation startFrame={0} fadeOutStart={120} fadeOutDuration={1} />
      </div>
    </AbsoluteFill>
  );
}
