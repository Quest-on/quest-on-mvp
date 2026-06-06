import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2, LightParticles } from "../components";

// Cut 13 — 3.0s. Camera dives through the glass. White flash at frame ~22.
// Then we see the inside (blank cosmic backdrop). 90 frames.
export function Cut13(): ReactElement {
  const frame = useCurrentFrame();

  // Accelerating dive — scale 1.18 -> 4.4 over 0..36f
  const dive = interpolate(frame, [0, 36], [1.18, 4.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.expoOut,
  });
  // White flash 1f at frame 22
  const flashOp = frame >= 22 && frame <= 23 ? 1 : 0;

  // Post-flash: cosmic inside (deep navy + drifting particles)
  const insideOp = interpolate(frame, [24, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* Pre-flash: cube ballooning towards us */}
      {frame < 24 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${dive})`,
          }}
        >
          <BoxV2
            size={520}
            yawDeg={0}
            pitchDeg={0}
            surface="glass"
            crystallise={1}
            energy={0.65}
          />
        </div>
      ) : null}

      {/* White flash */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#fff",
          opacity: flashOp,
        }}
      />

      {/* Post-flash interior */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: insideOp,
          background:
            "radial-gradient(ellipse 80% 70% at 50% 50%, #061a2e 0%, #02060d 60%, #000 100%)",
        }}
      >
        <LightParticles
          startFrame={24}
          count={60}
          mode="drift"
          width={1920}
          height={1080}
          color="rgba(34,211,238,0.7)"
        />
      </div>
    </AbsoluteFill>
  );
}
