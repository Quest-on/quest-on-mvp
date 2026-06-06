import type { ReactElement, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../constants";

export type MaskShape = "inset" | "circle";
export type MaskFrom = "top" | "bottom" | "left" | "right" | "center";

export interface MaskRevealProps {
  children: ReactNode;
  startFrame: number;
  durationFrames?: number;
  shape?: MaskShape;
  from?: MaskFrom;
}

function buildInsetClip(progress: number, from: MaskFrom): string {
  // progress 0 → fully clipped, 1 → fully revealed
  const closed = 100;
  const value = (1 - progress) * closed;
  switch (from) {
    case "top":
      return `inset(0 0 ${value}% 0)`;
    case "bottom":
      return `inset(${value}% 0 0 0)`;
    case "left":
      return `inset(0 ${value}% 0 0)`;
    case "right":
      return `inset(0 0 0 ${value}%)`;
    case "center":
    default: {
      const half = value / 2;
      return `inset(${half}% ${half}% ${half}% ${half}%)`;
    }
  }
}

function buildCircleClip(progress: number, from: MaskFrom): string {
  // Diagonal of viewport box ≈ 71% radius covers the corners.
  const maxRadius = 75;
  const radius = progress * maxRadius;
  switch (from) {
    case "top":
      return `circle(${radius}% at 50% 0%)`;
    case "bottom":
      return `circle(${radius}% at 50% 100%)`;
    case "left":
      return `circle(${radius}% at 0% 50%)`;
    case "right":
      return `circle(${radius}% at 100% 50%)`;
    case "center":
    default:
      return `circle(${radius}% at 50% 50%)`;
  }
}

export function MaskReveal({
  children,
  startFrame,
  durationFrames = 24,
  shape = "inset",
  from = "bottom",
}: MaskRevealProps): ReactElement {
  const frame = useCurrentFrame();
  const progress = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicInOut,
    },
  );
  const clipPath =
    shape === "circle"
      ? buildCircleClip(progress, from)
      : buildInsetClip(progress, from);

  return (
    <div
      style={{
        clipPath,
        WebkitClipPath: clipPath,
        willChange: "clip-path",
      }}
    >
      {children}
    </div>
  );
}
