import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { LightParticles, QuestOnLogo } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 17 — 6.0s. Quest-On real logo SVG reveal — stroke draw + gradient fill.
// Wordmark below. Static. Star residue glow behind. 180 frames.
export function Cut17(): ReactElement {
  const frame = useCurrentFrame();

  const residual = interpolate(frame, [0, 90], [0.32, 0.12], {
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

      <QuestOnLogo
        size={240}
        startFrame={0}
        durationFrames={70}
        wordmark="Quest-On"
        wordmarkSize={140}
      />
    </AbsoluteFill>
  );
}
