import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2 } from "./BoxV2";

export interface MultiBoxGridProps {
  startFrame?: number;
  // Total cubes. Spec uses 6 (2x3). 5 sparse alternative also supported.
  count?: number;
  cols?: number;
  // Size of each cube in pixels.
  size?: number;
  // Stage width / height. Cubes are positioned within this box.
  width?: number;
  height?: number;
}

export function MultiBoxGrid({
  startFrame = 0,
  count = 6,
  cols = 3,
  size = 220,
  width = 1500,
  height = 760,
}: MultiBoxGridProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const rows = Math.ceil(count / cols);
  const colGap = (width - cols * size) / (cols + 1);
  const rowGap = (height - rows * size) / (rows + 1);

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        margin: "0 auto",
      }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = colGap + c * (size + colGap);
        const y = rowGap + r * (size + rowGap);
        const phase = i * 0.7;
        // Gentle vibration: ±0.012 yaw, ±2px translateY.
        const wobbleY = Math.sin(local * 0.05 + phase) * 2.4;
        const yaw = -22 + Math.sin(local * 0.04 + phase) * 1.6;
        const pitch = 16 + Math.cos(local * 0.04 + phase) * 1.0;
        // Stagger fade-in per cube.
        const appear = interpolate(local, [i * 4, i * 4 + 18], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASING.smoothOut,
        });
        const energy = 0.18 + Math.abs(Math.sin(local * 0.06 + phase)) * 0.18;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x + size / 2,
              top: y + size / 2 + wobbleY,
              width: size,
              height: size,
              opacity: appear,
              transform: "translate(-50%, -50%)",
            }}
          >
            <BoxV2
              size={size}
              yawDeg={yaw}
              pitchDeg={pitch}
              energy={energy}
              noise={false}
              scale={0.95 + appear * 0.05}
            />
          </div>
        );
      })}
    </div>
  );
}
