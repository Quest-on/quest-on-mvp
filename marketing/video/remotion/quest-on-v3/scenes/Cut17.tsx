import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { WordmarkReveal } from "../../quest-on-glassbox/components/WordmarkReveal";
import { LightParticles } from "../components";

// Cut 17 — 6.0s. Wordmark "Quest-On" hold. Static. Star residue glow behind.
// 180 frames.
export function Cut17(): ReactElement {
  const frame = useCurrentFrame();

  // Residual star afterglow.
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
          color="rgba(34,211,238,0.45)"
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 1200,
          height: 220,
          marginLeft: -600,
          marginTop: -110,
        }}
      >
        <WordmarkReveal
          text="Quest-On"
          startFrame={0}
          strokeDurationFrames={42}
          fillStartRatio={0.5}
          fontSize={140}
        />
      </div>
    </AbsoluteFill>
  );
}
