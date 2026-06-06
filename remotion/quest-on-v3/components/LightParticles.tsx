import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";

export interface LightParticlesProps {
  startFrame?: number;
  count?: number;
  // Stage size in pixels.
  width?: number;
  height?: number;
  // Particle role: drifting / explode-out / converge-in.
  mode?: "drift" | "explode" | "converge";
  // Duration over which the particle motion completes (explode/converge).
  durationFrames?: number;
  color?: string;
}

function rand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function LightParticles({
  startFrame = 0,
  count = 80,
  width = 1920,
  height = 1080,
  mode = "drift",
  durationFrames = 60,
  color = "rgba(34,211,238,0.85)",
}: LightParticlesProps): ReactElement {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - startFrame);

  const cx = width / 2;
  const cy = height / 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const ang = rand(i, 1) * Math.PI * 2;
        const dist = 60 + rand(i, 2) * 480;
        const phase = rand(i, 3) * Math.PI * 2;
        const size = 1.5 + rand(i, 4) * 2.5;

        let x: number;
        let y: number;
        let op: number;

        if (mode === "drift") {
          // Slow figure-8 around random anchor.
          const anchorX = rand(i, 5) * width;
          const anchorY = rand(i, 6) * height;
          x = anchorX + Math.cos(local * 0.02 + phase) * 24;
          y = anchorY + Math.sin(local * 0.02 + phase) * 16;
          op = 0.3 + (Math.sin(local * 0.04 + phase) + 1) / 2 * 0.5;
        } else if (mode === "explode") {
          const t = interpolate(local, [0, durationFrames], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          x = cx + Math.cos(ang) * dist * t;
          y = cy + Math.sin(ang) * dist * t;
          op = interpolate(t, [0, 0.15, 1], [0, 1, 0.05], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
        } else {
          // converge: from far ring -> centre.
          const startX = cx + Math.cos(ang) * dist;
          const startY = cy + Math.sin(ang) * dist;
          const t = interpolate(local, [0, durationFrames], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          x = startX + (cx - startX) * t;
          y = startY + (cy - startY) * t;
          op = interpolate(t, [0, 0.7, 1], [0, 0.95, 0.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
        }

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size * 2,
              height: size * 2,
              marginLeft: -size,
              marginTop: -size,
              borderRadius: "50%",
              background: color,
              boxShadow: `0 0 ${size * 4}px ${color}`,
              opacity: op,
            }}
          />
        );
      })}
    </div>
  );
}
