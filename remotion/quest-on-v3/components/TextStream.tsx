import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { TEXT_STREAM_LINES } from "../data";

export interface TextStreamProps {
  startFrame?: number;
  // Pixels per frame the stream travels upward.
  speed?: number;
  width?: number;
  height?: number;
  // Direction multiplier: -1 scrolls upward, 1 downward.
  direction?: -1 | 1;
}

const LINE_HEIGHT = 28;

export function TextStream({
  startFrame = 0,
  speed = 4,
  width = 380,
  height = 520,
  direction = -1,
}: TextStreamProps): ReactElement {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - startFrame);

  const offset = local * speed * direction;

  // Repeat the source array enough times to cover the visible window.
  const repeated = [
    ...TEXT_STREAM_LINES,
    ...TEXT_STREAM_LINES,
    ...TEXT_STREAM_LINES,
  ];

  const totalHeight = repeated.length * LINE_HEIGHT;
  // Wrap the offset so the loop is seamless.
  const wrapped = ((offset % totalHeight) + totalHeight) % totalHeight;

  const fadeIn = interpolate(local, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        overflow: "hidden",
        opacity: fadeIn * 0.9,
        WebkitMaskImage:
          "linear-gradient(180deg, transparent 0%, #000 18%, #000 82%, transparent 100%)",
        maskImage:
          "linear-gradient(180deg, transparent 0%, #000 18%, #000 82%, transparent 100%)",
        background:
          "linear-gradient(180deg, rgba(2,6,14,0.55) 0%, rgba(2,6,14,0.4) 100%)",
        borderRadius: 8,
        border: "1px solid rgba(180,200,230,0.08)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          transform: `translateY(${-wrapped}px)`,
          fontFamily: "'JetBrains Mono', 'SF Mono', 'Pretendard Variable', monospace",
          fontSize: 14,
          lineHeight: `${LINE_HEIGHT}px`,
          color: "rgba(178,196,219,0.86)",
          padding: "12px 18px",
          whiteSpace: "nowrap",
        }}
      >
        {repeated.map((line, i) => {
          // Slight per-line opacity wobble for atmosphere.
          const phase = ((i * 13) % 7) / 6;
          const op = 0.45 + phase * 0.45;
          // Highlight every 4th line in cyan.
          const isAccent = i % 4 === 1;
          return (
            <div
              key={i}
              style={{
                opacity: op,
                color: isAccent ? "#22d3ee" : undefined,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}
