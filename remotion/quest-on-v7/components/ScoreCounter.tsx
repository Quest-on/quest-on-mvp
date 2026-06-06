import type { CSSProperties, ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";

export interface ScoreCounterProps {
  // Frame at which the count-up starts.
  startFrame: number;
  // How many frames the count-up takes. Default 30 (1s @ 30fps).
  durationFrames?: number;
  // Final integer value to land on.
  targetValue: number;
  // Font size in px.
  fontSize?: number;
  // Font weight.
  fontWeight?: number | string;
  // Inline style overrides.
  style?: CSSProperties;
}

// 0 → targetValue ease-out integer counter. The count is interpolated as a
// float and floored each frame so the displayed digits step naturally.
export function ScoreCounter({
  startFrame,
  durationFrames = 30,
  targetValue,
  fontSize = 38,
  fontWeight = 800,
  style,
}: ScoreCounterProps): ReactElement {
  const frame = useCurrentFrame();
  const value = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, targetValue],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );
  // Snap to integer for the visible digits (avoids "87.4321" jitter).
  const display = Math.max(0, Math.floor(value));

  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        fontSize,
        fontWeight,
        lineHeight: 1,
        ...style,
      }}
    >
      {display}
    </span>
  );
}
