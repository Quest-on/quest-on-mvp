import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { THOUGHT_FRAGMENTS } from "../data";

export interface ThoughtTrajectoryProps {
  startFrame?: number;
  width?: number;
  height?: number;
  // Number of curves to draw (max 12).
  count?: number;
  // Show fragment text near each terminal node.
  withFragments?: boolean;
}

interface CurveSpec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  delay: number;
}

function rand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function makeCurves(count: number, w: number, h: number): CurveSpec[] {
  const out: CurveSpec[] = [];
  for (let i = 0; i < count; i++) {
    const x1 = 60 + rand(i, 1) * (w - 120);
    const y1 = 60 + rand(i, 2) * (h - 120);
    const x2 = 60 + rand(i, 3) * (w - 120);
    const y2 = 60 + rand(i, 4) * (h - 120);
    out.push({
      x1,
      y1,
      x2,
      y2,
      cx1: x1 + (x2 - x1) * 0.3 + (rand(i, 5) - 0.5) * 80,
      cy1: y1 + (y2 - y1) * 0.3 + (rand(i, 6) - 0.5) * 80,
      cx2: x1 + (x2 - x1) * 0.7 + (rand(i, 7) - 0.5) * 80,
      cy2: y1 + (y2 - y1) * 0.7 + (rand(i, 8) - 0.5) * 80,
      delay: i * 5,
    });
  }
  return out;
}

export function ThoughtTrajectory({
  startFrame = 0,
  width = 1100,
  height = 600,
  count = 12,
  withFragments = true,
}: ThoughtTrajectoryProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const curves = makeCurves(count, width, height);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="tt-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.85} />
          <stop offset="100%" stopColor="#34d399" stopOpacity={0.7} />
        </linearGradient>
        <radialGradient id="tt-node">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.95} />
          <stop offset="60%" stopColor="#22d3ee" stopOpacity={0.7} />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
        </radialGradient>
      </defs>

      {curves.map((c, i) => {
        const path = `M ${c.x1} ${c.y1} C ${c.cx1} ${c.cy1}, ${c.cx2} ${c.cy2}, ${c.x2} ${c.y2}`;
        const approxLen = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) * 1.4;
        const t = interpolate(local, [c.delay, c.delay + 28], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASING.smoothOut,
        });
        return (
          <path
            key={`c-${i}`}
            d={path}
            stroke={i % 5 === 0 ? "#a78bfa" : "url(#tt-stroke)"}
            strokeWidth={1}
            fill="none"
            strokeDasharray={approxLen}
            strokeDashoffset={(1 - t) * approxLen}
            opacity={0.6 * t}
          />
        );
      })}

      {curves.map((c, i) => {
        // Terminal node + start node
        const startT = interpolate(local, [c.delay, c.delay + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const endT = interpolate(local, [c.delay + 22, c.delay + 34], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <g key={`n-${i}`}>
            <circle
              cx={c.x1}
              cy={c.y1}
              r={2.4 * startT}
              fill="url(#tt-node)"
              opacity={startT}
            />
            <circle
              cx={c.x2}
              cy={c.y2}
              r={2.6 * endT}
              fill="url(#tt-node)"
              opacity={endT}
            />
          </g>
        );
      })}

      {withFragments
        ? curves.slice(0, Math.min(THOUGHT_FRAGMENTS.length, count)).map((c, i) => {
            const t = interpolate(local, [c.delay + 26, c.delay + 44], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASING.smoothOut,
            });
            const text = THOUGHT_FRAGMENTS[i] ?? "";
            return (
              <text
                key={`t-${i}`}
                x={c.x2 + 10}
                y={c.y2 + 4}
                fontFamily="'Pretendard Variable', sans-serif"
                fontSize={13}
                fontWeight={500}
                fill="rgba(226,232,240,0.78)"
                opacity={t}
              >
                {text}
              </text>
            );
          })
        : null}
    </svg>
  );
}
