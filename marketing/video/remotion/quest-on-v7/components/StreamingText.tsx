import type { CSSProperties, ReactElement } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

export interface StreamingTextProps {
  // Full text to reveal character-by-character.
  text: string;
  // Frame at which the typewriter begins.
  startFrame: number;
  // Streaming speed in characters per second. Default ~35 (LLM-feel).
  charsPerSecond?: number;
  // Show a blinking caret at the end of the visible substring (default true).
  cursor?: boolean;
  // Inline style overrides on the wrapper.
  style?: CSSProperties;
  // Color for the blinking caret. Defaults to currentColor.
  cursorColor?: string;
}

// SSE-flavoured typewriter. Slices the source string by Unicode code point so
// 한글 모아쓰기 (precomposed Hangul syllables) survive — we never split inside
// a glyph. Frame-driven via useCurrentFrame() — no CSS animation.
export function StreamingText({
  text,
  startFrame,
  charsPerSecond = 35,
  cursor = true,
  style,
  cursorColor,
}: StreamingTextProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - startFrame);
  // Code-point aware iteration so surrogate pairs / combined glyphs aren't split mid-character.
  const codePoints = Array.from(text);
  const elapsedSec = local / fps;
  const revealCount = Math.min(
    codePoints.length,
    Math.floor(elapsedSec * charsPerSecond),
  );
  const visible = codePoints.slice(0, revealCount).join("");
  const isStreaming = revealCount < codePoints.length;
  // Blink cursor at ~2Hz while streaming; soft pulse after completion (so the
  // cursor doesn't suddenly disappear at the end of the reveal).
  const blink = (Math.sin(frame * 0.6) + 1) / 2; // 0..1
  const cursorOpacity = isStreaming ? (blink > 0.5 ? 1 : 0.15) : blink * 0.6;

  return (
    <span style={style}>
      {visible}
      {cursor ? (
        <span
          style={{
            display: "inline-block",
            width: "0.55em",
            marginLeft: 1,
            transform: "translateY(0.05em)",
            color: cursorColor ?? "currentColor",
            opacity: cursorOpacity,
          }}
        >
          │
        </span>
      ) : null}
    </span>
  );
}
