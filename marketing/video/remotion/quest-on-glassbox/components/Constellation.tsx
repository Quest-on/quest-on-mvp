import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";

export interface ConstellationProps {
  startFrame?: number;
  // Frame at which the points should fade out (Scene 4 final beat).
  fadeOutStart?: number;
  fadeOutDuration?: number;
}

const CANVAS_W = 1400;
const CANVAS_H = 800;

// Pseudo-random helper.
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// 24 points distributed across canvas.
const POINTS = Array.from({ length: 24 }, (_, i) => ({
  cx: 80 + rand(i, 1) * (CANVAS_W - 160),
  cy: 80 + rand(i, 2) * (CANVAS_H - 160),
  r: 1.5 + rand(i, 3) * 2.2,
  z: rand(i, 4), // 0..1, used for parallax depth
  born: i * 3,
}));

// 18 lines connecting nearby points.
const LINES = (() => {
  const out: Array<{ a: number; b: number; born: number }> = [];
  for (let i = 0; i < POINTS.length && out.length < 18; i++) {
    for (let j = i + 1; j < POINTS.length && out.length < 18; j++) {
      const a = POINTS[i]!;
      const b = POINTS[j]!;
      const dx = a.cx - b.cx;
      const dy = a.cy - b.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 280) {
        out.push({ a: i, b: j, born: 24 + out.length * 4 });
      }
    }
  }
  return out;
})();

export function Constellation({
  startFrame = 0,
  fadeOutStart = 360,
  fadeOutDuration = 21,
}: ConstellationProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Yaw rotation: 0 -> 12° between 90f and 228f, then hold.
  const yaw = interpolate(local, [90, 228], [0, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  const fadeOut = interpolate(
    local,
    [fadeOutStart, fadeOutStart + fadeOutDuration],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
        transform: `rotateY(${yaw}deg)`,
        transformStyle: "preserve-3d",
      }}
    >
      <svg
        width={CANVAS_W}
        height={CANVAS_H}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="con-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.7} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.7} />
          </linearGradient>
          <radialGradient id="con-point">
            <stop offset="0%" stopColor="#fff" stopOpacity={1} />
            <stop offset="60%" stopColor="#22d3ee" stopOpacity={0.85} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Lines */}
        {LINES.map((ln, i) => {
          const a = POINTS[ln.a];
          const b = POINTS[ln.b];
          if (!a || !b) return null;
          const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
          const drawProgress = interpolate(local, [ln.born, ln.born + 30], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.smoothOut,
          });
          const stroke = i % 9 === 0 ? "#a78bfa" : "url(#con-line)";
          return (
            <line
              key={i}
              x1={a.cx}
              y1={a.cy}
              x2={b.cx}
              y2={b.cy}
              stroke={stroke}
              strokeWidth={1}
              strokeDasharray={dist}
              strokeDashoffset={(1 - drawProgress) * dist}
              opacity={0.55}
            />
          );
        })}

        {/* Points */}
        {POINTS.map((p, i) => {
          const appear = interpolate(local, [p.born, p.born + 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.expoOut,
          });
          // Slight parallax: deeper points (z near 0) shift less.
          const parallax = Math.sin(local * 0.02) * (p.z * 6);
          return (
            <circle
              key={i}
              cx={p.cx + parallax}
              cy={p.cy}
              r={p.r * appear}
              fill="url(#con-point)"
              opacity={appear}
            />
          );
        })}
      </svg>
    </div>
  );
}

export const CONSTELLATION_CENTER = {
  x: CANVAS_W / 2,
  y: CANVAS_H / 2,
} as const;
