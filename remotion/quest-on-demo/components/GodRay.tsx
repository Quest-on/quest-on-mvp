import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../constants";

export interface GodRayProps {
  startFrame?: number;
  durationFrames?: number;
  angle?: number; // degrees, default -18
  intensity?: number; // 0-1, default 1
  color?: string; // default emerald
}

export function GodRay({
  startFrame = 0,
  durationFrames = 120,
  angle = -18,
  intensity = 1,
  color = "rgba(110,231,183,0.28)",
}: GodRayProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  // Light pool drifts across the screen, fades in then out.
  const x = interpolate(local, [0, durationFrames], [-30, 130], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const fade = interpolate(
    local,
    [0, durationFrames * 0.25, durationFrames * 0.75, durationFrames],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: `${x}%`,
          top: "20%",
          width: "60%",
          height: "60%",
          background: `linear-gradient(90deg, transparent 0%, ${color} 45%, ${color} 55%, transparent 100%)`,
          transform: `rotate(${angle}deg)`,
          filter: "blur(40px)",
          opacity: fade * intensity,
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
}
