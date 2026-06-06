import type { CSSProperties, ReactElement } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASING } from "../../quest-on-demo/constants";

export interface KineticTypeProps {
  text: string;
  startFrame: number;
  // Per-character delay in seconds. Default 0.06s.
  staggerSeconds?: number;
  // Per-character reveal length in frames.
  perCharFrames?: number;
  // Pixel y-offset before reveal.
  yOffset?: number;
  style?: CSSProperties;
  // If true, uses Array.from() to split — preserves Korean syllables intact.
  splitChars?: boolean;
  // Per-character style applied to every inner span. Useful for gradient text:
  // each char-span has its own paint context (because of opacity/transform),
  // which isolates `WebkitBackgroundClip: text` from the parent. Apply the
  // gradient on each char directly via this prop.
  charStyle?: CSSProperties;
}

// Glyph-level reveal. For Korean we still split by Array.from so that pre-composed
// syllables (가 나 다 …) come out as one unit each. CSS animations are not used —
// every transform/opacity is frame-driven.
export function KineticType({
  text,
  startFrame,
  staggerSeconds = 0.06,
  perCharFrames = 14,
  yOffset = 10,
  style,
  splitChars = true,
  charStyle,
}: KineticTypeProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const staggerFrames = staggerSeconds * fps;
  const chars = splitChars ? Array.from(text) : [text];

  return (
    <span style={{ display: "inline-block", ...style }}>
      {chars.map((char, index) => {
        if (char === " ") {
          return (
            <span key={index} style={{ display: "inline-block", width: "0.4em" }}>
              {" "}
            </span>
          );
        }
        const localStart = startFrame + index * staggerFrames;
        const progress = interpolate(
          frame,
          [localStart, localStart + perCharFrames],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.expoOut,
          },
        );
        return (
          <span
            key={index}
            style={{
              display: "inline-block",
              opacity: progress,
              transform: `translateY(${(1 - progress) * yOffset}px)`,
              willChange: "transform, opacity",
              ...charStyle,
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}
