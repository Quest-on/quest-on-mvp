import type { CSSProperties, ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";

export interface AIThinkingProps {
  // Frame at which the label appears.
  startFrame: number;
  // Total visible length in frames (includes fade-in/out).
  durationFrames: number;
  // Label text (defaults to Korean "AI 분석 중").
  text?: string;
  // Optional inline style overrides on the wrapper.
  style?: CSSProperties;
  // Number of frames used for the fade-in / fade-out caps.
  fadeFrames?: number;
}

// "AI 분석 중..." pulsing label with cycling dots. The label gently breathes
// (opacity 0.6 → 1.0) while three dots advance one-at-a-time on a 30-frame
// cycle. Always frame-driven.
export function AIThinking({
  startFrame,
  durationFrames,
  text = "AI 분석 중",
  style,
  fadeFrames = 8,
}: AIThinkingProps): ReactElement | null {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  if (local < 0 || local >= durationFrames) {
    return null;
  }

  const fadeIn = interpolate(local, [0, fadeFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const fadeOut = interpolate(
    local,
    [durationFrames - fadeFrames, durationFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );
  const breath = 0.6 + (Math.sin(local * 0.18) * 0.5 + 0.5) * 0.4; // 0.6..1.0
  const opacity = fadeIn * fadeOut * breath;

  // 30-frame cycle, three dot stages: 0..9 → "", 10..19 → ".", 20..29 → "..", 30 → "..."
  const stage = Math.floor(((local % 30) / 30) * 4);
  const dots = ".".repeat(stage);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: QUESTON_BRAND.fontFamily,
        fontSize: 13,
        fontWeight: 600,
        color: QUESTON_BRAND.primary,
        letterSpacing: "0.02em",
        opacity,
        ...style,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: QUESTON_BRAND.primary,
          boxShadow: `0 0 10px ${QUESTON_BRAND.primaryLight}`,
        }}
      />
      <span>
        {text}
        {dots}
      </span>
    </div>
  );
}
