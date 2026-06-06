import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2, LightParticles } from "../components";

// Cut 2 — 2.0s. Particle burst -> 12 particles get sucked back -> cube crystallizes.
// Slow push-in (Z 1.0 -> 1.04). 60 frames.
export function Cut02(): ReactElement {
  const frame = useCurrentFrame();

  // Particle phase 0..36f explode -> from 36..60f converge into cube.
  // Cube reveals starting at frame 32.
  const cubeReveal = interpolate(frame, [32, 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.expoOut,
  });
  const cubeScale = interpolate(frame, [32, 60], [0.4, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const pushIn = interpolate(frame, [0, 60], [1, 1.04], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #050a14 0%, #000 70%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${pushIn})`,
        }}
      >
        {/* explode 0-30f */}
        {frame < 30 ? (
          <LightParticles
            startFrame={0}
            count={28}
            mode="explode"
            durationFrames={30}
            color="rgba(34,211,238,0.9)"
          />
        ) : null}
        {/* converge 28-56f */}
        {frame >= 24 && frame < 58 ? (
          <LightParticles
            startFrame={24}
            count={28}
            mode="converge"
            durationFrames={28}
            color="rgba(34,211,238,0.85)"
          />
        ) : null}
        {/* cube emerges */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: cubeReveal,
          }}
        >
          <BoxV2
            size={420}
            yawDeg={-22}
            pitchDeg={18}
            energy={0.2}
            scale={cubeScale}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
