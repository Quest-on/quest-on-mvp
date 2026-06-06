import type { ReactElement } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

export interface AnimatedGridProps {
  opacity?: number;
  cellSize?: number;
}

export function AnimatedGrid({
  opacity = 0.38,
  cellSize = 72,
}: AnimatedGridProps): ReactElement {
  const frame = useCurrentFrame();
  // Slow drift so background motion never competes with foreground content.
  const drift = (frame * 0.32) % cellSize;

  return (
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
        backgroundSize: `${cellSize}px ${cellSize}px`,
        transform: `translate3d(${-drift}px, ${drift * 0.4}px, 0)`,
        opacity,
      }}
    />
  );
}
