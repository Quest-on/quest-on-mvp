import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";

export interface OrganicCrackProps {
  startFrame?: number;
  // Width and height (canvas viewBox) of the crack overlay.
  width?: number;
  height?: number;
  // Final reveal pulse (Cut 9 -> 10 transition).
  pulseAt?: number;
}

interface BranchSpec {
  // Start point in viewBox space.
  x0: number;
  y0: number;
  // End point.
  x1: number;
  y1: number;
  // Stagger delay in frames.
  delay: number;
  // Draw duration in frames (12..21).
  draw: number;
  // Stroke width.
  width: number;
}

// L-system seed — hardcoded for reproducibility. Root impact at (160, 110).
// 1 stem -> 3 branches -> 9 micro-branches = 13 paths.
const ROOT = { x: 160, y: 110 };

function makeBranches(): BranchSpec[] {
  const out: BranchSpec[] = [];
  // Stem
  const stemEnd = { x: ROOT.x + 60, y: ROOT.y + 50 };
  out.push({
    x0: ROOT.x,
    y0: ROOT.y,
    x1: stemEnd.x,
    y1: stemEnd.y,
    delay: 0,
    draw: 18,
    width: 1.6,
  });
  // 3 sub-branches off stem end
  const subAngles = [-25, 8, 32];
  const subEnds: { x: number; y: number }[] = [];
  subAngles.forEach((angDeg, i) => {
    const ang = (angDeg * Math.PI) / 180;
    const len = 60;
    const ex = stemEnd.x + Math.cos(ang) * len;
    const ey = stemEnd.y + Math.sin(ang) * len;
    subEnds.push({ x: ex, y: ey });
    out.push({
      x0: stemEnd.x,
      y0: stemEnd.y,
      x1: ex,
      y1: ey,
      delay: 14 + i * 3,
      draw: 16,
      width: 1.3,
    });
  });
  // 3 micro-branches off each sub end (9 total)
  const microAngles = [-18, 0, 22];
  subEnds.forEach((s, i) => {
    microAngles.forEach((mDeg, j) => {
      const baseAng = (subAngles[i] ?? 0) * Math.PI / 180;
      const ang = baseAng + (mDeg * Math.PI) / 180;
      const len = 32 + ((i + j) % 3) * 6;
      const ex = s.x + Math.cos(ang) * len;
      const ey = s.y + Math.sin(ang) * len;
      out.push({
        x0: s.x,
        y0: s.y,
        x1: ex,
        y1: ey,
        delay: 30 + i * 4 + j * 2,
        draw: 14,
        width: 0.9,
      });
    });
  });
  return out;
}

const BRANCHES = makeBranches();

// Debris polygons spawn from each sub-branch end.
const DEBRIS = BRANCHES.slice(1, 4).map((b, i) => ({
  x: b.x1,
  y: b.y1,
  delay: b.delay + b.draw - 4,
  driftX: (i % 2 === 0 ? 1 : -1) * (28 + i * 6),
  driftY: -20 - i * 8,
  rot: (i % 2 === 0 ? 1 : -1) * 140,
  size: 4 + (i % 3),
}));

export function OrganicCrack({
  startFrame = 0,
  width = 480,
  height = 480,
  pulseAt,
}: OrganicCrackProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Final unify pulse — strokeWidth 1 -> 1.66 -> 1 over 9 frames near pulseAt.
  const pulseT = pulseAt
    ? interpolate(local, [pulseAt - 4, pulseAt, pulseAt + 5], [1, 1.66, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 320 320"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <defs>
        <linearGradient id="crack-leak" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.85} />
          <stop offset="100%" stopColor="#34d399" stopOpacity={0.65} />
        </linearGradient>
        <radialGradient id="impact-glow">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.95} />
          <stop offset="40%" stopColor="#22d3ee" stopOpacity={0.7} />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
        </radialGradient>
        <filter id="crack-glow">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {/* Impact light leak at root */}
      {(() => {
        const t = interpolate(local, [0, 18], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASING.expoOut,
        });
        return (
          <circle
            cx={ROOT.x}
            cy={ROOT.y}
            r={8 + t * 36}
            fill="url(#impact-glow)"
            opacity={t * 0.9}
          />
        );
      })()}

      {/* Branches: stroke-dashoffset reveal */}
      {BRANCHES.map((b, i) => {
        const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
        const t = interpolate(local, [b.delay, b.delay + b.draw], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASING.smoothOut,
        });
        return (
          <g key={`b-${i}`}>
            {/* Glow underlayer */}
            <line
              x1={b.x0}
              y1={b.y0}
              x2={b.x1}
              y2={b.y1}
              stroke="url(#crack-leak)"
              strokeWidth={b.width * 2.4 * pulseT}
              strokeDasharray={len}
              strokeDashoffset={(1 - t) * len}
              filter="url(#crack-glow)"
              opacity={0.6 * t}
            />
            {/* Crisp line */}
            <line
              x1={b.x0}
              y1={b.y0}
              x2={b.x1}
              y2={b.y1}
              stroke="#22d3ee"
              strokeWidth={b.width * pulseT}
              strokeDasharray={len}
              strokeDashoffset={(1 - t) * len}
              opacity={0.92 * t}
            />
          </g>
        );
      })}

      {/* Debris polygons */}
      {DEBRIS.map((d, i) => {
        const t = interpolate(local, [d.delay, d.delay + 30], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASING.cubicOut,
        });
        const dx = d.driftX * t;
        const dy = d.driftY * t + (t * t) * 30; // gravity
        const op = interpolate(t, [0, 0.2, 1], [0, 0.85, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const rot = d.rot * t;
        return (
          <polygon
            key={`d-${i}`}
            points={`0,${-d.size} ${d.size},${d.size * 0.5} ${-d.size * 0.7},${d.size * 0.7}`}
            transform={`translate(${d.x + dx} ${d.y + dy}) rotate(${rot})`}
            fill="#22d3ee"
            opacity={op}
          />
        );
      })}
    </svg>
  );
}
