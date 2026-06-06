import type { CSSProperties, ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, EASING, TYPO } from "../../quest-on-demo/constants";

export interface WordRevealProps {
  // Pre-split words. Eojeol-level only; no per-character split.
  words: readonly string[] | string[];
  startFrame?: number;
  // Frames between word entries (default 4 = ~133ms).
  staggerFrames?: number;
  // Frames each word takes to enter (default 14).
  wordDurationFrames?: number;
  // Hold then exit. If set, fade-out begins after holdFrames + (last word entry).
  holdFrames?: number;
  exitFrames?: number;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  // Optional gradient fill (background-clip:text). If true, COLORS.gradientPrimary used.
  gradient?: boolean;
  // Override gradient colours (start stop). Only used when gradient=true.
  gradientColors?: [string, string];
  // Position from top in CSS units. Default centred.
  top?: string;
  // Letter spacing override.
  letterSpacing?: string;
  // Horizontal anchor: "center" (default) or "bottom-center" (for sub-copy).
  anchor?: "center" | "bottom-center";
}

export function WordReveal({
  words,
  startFrame = 0,
  staggerFrames = 4,
  wordDurationFrames = 14,
  holdFrames = 60,
  exitFrames = 18,
  fontSize = 88,
  fontWeight = 700,
  color = COLORS.ink,
  gradient = false,
  gradientColors,
  top,
  letterSpacing = TYPO.letterSpacingTight,
  anchor = "center",
}: WordRevealProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const wordList = Array.from(words);
  const lastWordEntry = (wordList.length - 1) * staggerFrames + wordDurationFrames;
  const exitStart = lastWordEntry + holdFrames;

  const groupExit = interpolate(
    local,
    [exitStart, exitStart + exitFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  const wrap: CSSProperties =
    anchor === "bottom-center"
      ? {
          position: "absolute",
          left: "50%",
          bottom: "12%",
          transform: "translateX(-50%)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.32em",
          maxWidth: "80%",
          opacity: groupExit,
        }
      : {
          position: "absolute",
          left: "50%",
          top: top ?? "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.32em",
          maxWidth: "80%",
          opacity: groupExit,
        };

  const baseTextStyle: CSSProperties = {
    fontFamily: TYPO.fontFamily,
    fontWeight,
    fontSize,
    letterSpacing,
    lineHeight: TYPO.lineHeightTitle,
    color: gradient ? "transparent" : color,
    backgroundImage: gradient
      ? gradientColors
        ? `linear-gradient(90deg, ${gradientColors[0]}, ${gradientColors[1]})`
        : COLORS.gradientPrimary
      : undefined,
    WebkitBackgroundClip: gradient ? "text" : undefined,
    backgroundClip: gradient ? "text" : undefined,
    margin: 0,
  };

  return (
    <div style={wrap}>
      {wordList.map((w, i) => {
        const t = interpolate(
          local,
          [i * staggerFrames, i * staggerFrames + wordDurationFrames],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.smoothOut,
          },
        );
        return (
          <span
            key={`${w}-${i}`}
            style={{
              ...baseTextStyle,
              display: "inline-block",
              opacity: t,
              transform: `translateY(${(1 - t) * 14}px)`,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}
