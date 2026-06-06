import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";

export interface WordmarkRevealProps {
  text: string;
  startFrame: number;
  // Stroke draw duration in frames (default 42 = 1.4s @ 30fps).
  strokeDurationFrames?: number;
  // Fill fade-in starts after strokeDurationFrames * fillStartRatio.
  fillStartRatio?: number;
  fontSize?: number;
}

// Two-pass reveal: stroke draws first via SVG text strokeDashoffset, then
// the filled glyph fades in on top. No CSS animations.
export function WordmarkReveal({
  text,
  startFrame,
  strokeDurationFrames = 42,
  fillStartRatio = 0.5,
  fontSize = 140,
}: WordmarkRevealProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  const strokeProgress = interpolate(
    local,
    [0, strokeDurationFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );
  const fillStart = strokeDurationFrames * fillStartRatio;
  const fillProgress = interpolate(
    local,
    [fillStart, fillStart + 24],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  // Approximate path length for stroke dasharray. Set big enough that any
  // glyph stroke stays clipped while progress < 1.
  const dashTotal = 2400;
  const strokeOpacity = interpolate(local, [0, 6, strokeDurationFrames + 18], [0, 1, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg
      width="100%"
      height={fontSize * 1.4}
      viewBox={`0 0 1200 ${fontSize * 1.4}`}
      style={{ overflow: "visible" }}
    >
      {/* Stroke pass */}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Pretendard Variable', sans-serif"
        fontSize={fontSize}
        fontWeight={700}
        letterSpacing="-0.04em"
        fill="none"
        stroke="#22d3ee"
        strokeWidth={1.5}
        strokeDasharray={dashTotal}
        strokeDashoffset={(1 - strokeProgress) * dashTotal}
        opacity={strokeOpacity}
        style={{ filter: "drop-shadow(0 0 6px rgba(34,211,238,0.55))" }}
      >
        {text}
      </text>
      {/* Fill pass */}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Pretendard Variable', sans-serif"
        fontSize={fontSize}
        fontWeight={700}
        letterSpacing="-0.04em"
        fill="#f8fafc"
        opacity={fillProgress}
      >
        {text}
      </text>
    </svg>
  );
}
