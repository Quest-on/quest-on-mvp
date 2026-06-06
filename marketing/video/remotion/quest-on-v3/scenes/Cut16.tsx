import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { LightParticles, WordmarkFormation } from "../components";

// Cut 16 — 4.0s. Constellation points -> particles converge into wordmark.
// 120 frames.
export function Cut16(): ReactElement {
  const frame = useCurrentFrame();

  // Background star fade-out as particles converge.
  const starFade = interpolate(frame, [0, 36], [1, 0.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse 80% 70% at 50% 50%, #02060d 0%, #000 70%)",
      }}
    >
      {/* Lingering background particles */}
      <div style={{ opacity: starFade }}>
        <LightParticles
          startFrame={-30}
          count={40}
          mode="drift"
          width={1920}
          height={1080}
          color="rgba(34,211,238,0.45)"
        />
      </div>

      {/* Converging particles into centre */}
      <LightParticles
        startFrame={0}
        count={70}
        mode="converge"
        durationFrames={70}
        width={1920}
        height={1080}
        color="rgba(34,211,238,0.85)"
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 840,
          height: 280,
          marginLeft: -420,
          marginTop: -140,
        }}
      >
        <WordmarkFormation startFrame={30} durationFrames={88} />
      </div>
    </AbsoluteFill>
  );
}
