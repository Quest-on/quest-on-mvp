import type { CSSProperties, ReactElement } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASING } from "../constants";

export interface StaggeredWordsProps {
  text: string;
  startFrame?: number;
  perWord?: number;
  staggerMs?: number;
  style?: CSSProperties;
}

export function StaggeredWords({
  text,
  startFrame = 0,
  perWord = 14,
  staggerMs = 90,
  style,
}: StaggeredWordsProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Split by whitespace only — Korean composes per syllable so per-char would shred glyphs.
  const words = text.split(/(\s+)/);
  const staggerFrames = (staggerMs / 1000) * fps;

  return (
    <span style={{ display: "inline", ...style }}>
      {words.map((word, index) => {
        if (/^\s+$/.test(word)) {
          return <span key={index}>{word}</span>;
        }
        const localStart = startFrame + index * staggerFrames;
        const progress = interpolate(
          frame,
          [localStart, localStart + perWord],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.smoothOut,
          },
        );
        return (
          <span
            key={index}
            style={{
              display: "inline-block",
              opacity: progress,
              transform: `translateY(${(1 - progress) * 22}px)`,
              willChange: "transform, opacity",
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
}
