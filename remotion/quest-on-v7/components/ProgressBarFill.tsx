import type { CSSProperties, ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";

export interface ProgressBarFillProps {
  // Frame at which the fill animation begins.
  startFrame: number;
  // How many frames the fill animation takes. Default 24 (~0.8s @ 30fps).
  durationFrames?: number;
  // Final width as a percentage (0..100).
  targetPercent: number;
  // Bar fill color or CSS background string. Defaults to the Quest-On brand gradient.
  color?: string;
  // Bar height in px.
  height?: number;
  // Bar total width in px (the inner fill is targetPercent% of this).
  width?: number;
  // Track color behind the fill.
  trackColor?: string;
  // Outer style overrides.
  style?: CSSProperties;
}

// width: 0 → targetPercent% fill, ease-out, frame-driven. Used for rubric
// bars in the InstructorGradeMock so each rubric category fills as if AI is
// computing it live.
export function ProgressBarFill({
  startFrame,
  durationFrames = 24,
  targetPercent,
  color = QUESTON_BRAND.brandGradient,
  height = 10,
  width,
  trackColor = "#F1F5F9",
  style,
}: ProgressBarFillProps): ReactElement {
  const frame = useCurrentFrame();
  const clampedTarget = Math.max(0, Math.min(100, targetPercent));
  const pct = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, clampedTarget],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );

  return (
    <div
      style={{
        width: width ?? "100%",
        height,
        background: trackColor,
        borderRadius: height / 2,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: height / 2,
        }}
      />
    </div>
  );
}
