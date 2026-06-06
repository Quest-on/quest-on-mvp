import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";

export interface TimelineProps {
  startFrame?: number;
  width?: number;
  // Number of ticks across the timeline.
  ticks?: number;
  // Labels (left to right). Up to 4 displayed.
  labels?: string[];
}

const DEFAULT_LABELS = ["00:01", "04:12", "08:30", "12:45"];

export function Timeline({
  startFrame = 0,
  width = 1280,
  ticks = 12,
  labels = DEFAULT_LABELS,
}: TimelineProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const lineDraw = interpolate(local, [0, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const labelFade = interpolate(local, [24, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg
      width={width}
      height={70}
      viewBox={`0 0 ${width} 70`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="tl-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.85} />
          <stop offset="100%" stopColor="#34d399" stopOpacity={0.85} />
        </linearGradient>
      </defs>

      {/* Main line */}
      <line
        x1={20}
        y1={32}
        x2={width - 20}
        y2={32}
        stroke="url(#tl-stroke)"
        strokeWidth={1.4}
        strokeDasharray={width}
        strokeDashoffset={(1 - lineDraw) * width}
      />

      {/* Ticks */}
      {Array.from({ length: ticks }).map((_, i) => {
        const x = 20 + ((width - 40) * i) / (ticks - 1);
        const tt = interpolate(local, [10 + i * 2, 10 + i * 2 + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASING.smoothOut,
        });
        const isMajor = i % 3 === 0;
        return (
          <line
            key={i}
            x1={x}
            y1={32 - (isMajor ? 8 : 4)}
            x2={x}
            y2={32 + (isMajor ? 8 : 4)}
            stroke="rgba(178,196,219,0.6)"
            strokeWidth={1}
            opacity={tt}
          />
        );
      })}

      {/* Labels */}
      {labels.slice(0, 4).map((label, i) => {
        const x = 20 + ((width - 40) * i) / 3;
        return (
          <text
            key={i}
            x={x}
            y={60}
            textAnchor="middle"
            fontFamily="'JetBrains Mono', 'SF Mono', monospace"
            fontSize={12}
            fill="rgba(178,196,219,0.78)"
            opacity={labelFade}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
