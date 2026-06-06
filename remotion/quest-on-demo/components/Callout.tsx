import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, EASING } from "../constants";

export interface CalloutProps {
  label: string;
  x: number;
  y: number;
  color?: string;
}

export function Callout({
  label,
  x,
  y,
  color = COLORS.cyan,
}: CalloutProps): ReactElement {
  const frame = useCurrentFrame();
  // 44-frame loop = ~1.47s breathing pulse; gentle enough to read alongside content.
  const pulse = interpolate(frame % 44, [0, 22, 44], [0.7, 1, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        display: "flex",
        alignItems: "center",
        gap: 12,
        color,
        fontSize: 18,
        fontWeight: 900,
        opacity: pulse,
        letterSpacing: "-0.01em",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 24px ${color}`,
        }}
      />
      <span
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          background: "rgba(6,17,31,0.78)",
          border: `1px solid ${color}66`,
        }}
      >
        {label}
      </span>
    </div>
  );
}
