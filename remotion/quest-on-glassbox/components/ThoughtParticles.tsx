import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { THOUGHT_FRAGMENTS } from "../data";
import { GLASSBOX_INNER } from "./GlassBox";

export interface ThoughtParticlesProps {
  // Frame at which the inner volume starts to populate (relative to scene start).
  startFrame?: number;
  // Multiplier so the constellation scene can reuse it on a wider canvas.
  scale?: number;
}

const W = GLASSBOX_INNER.width;
const H = GLASSBOX_INNER.height;

// Pseudo-random helper (deterministic via index).
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const CURVES = Array.from({ length: 12 }, (_, i) => {
  const startX = rand(i, 1) * W;
  const startY = rand(i, 2) * H;
  const cx1 = rand(i, 3) * W;
  const cy1 = rand(i, 4) * H;
  const endX = rand(i, 5) * W;
  const endY = rand(i, 6) * H;
  const length = 280 + rand(i, 7) * 120;
  return {
    d: `M${startX},${startY} Q${cx1},${cy1} ${endX},${endY}`,
    length,
    born: 30 + i * 9,
    color: i % 3 === 0 ? "#34d399" : "#22d3ee",
    floatPhase: rand(i, 8) * Math.PI * 2,
  };
});

const CONNECTIONS = Array.from({ length: 5 }, (_, i) => {
  const ax = rand(i, 11) * W;
  const ay = rand(i, 12) * H;
  const bx = rand(i, 13) * W;
  const by = rand(i, 14) * H;
  return {
    x1: ax,
    y1: ay,
    x2: bx,
    y2: by,
    born: 90 + i * 14,
  };
});

const PARTICLES = Array.from({ length: 100 }, (_, i) => ({
  cx: rand(i, 21) * W,
  cy: rand(i, 22) * H,
  r: 0.8 + rand(i, 23) * 1.2,
  floatX: rand(i, 24) * Math.PI * 2,
  floatY: rand(i, 25) * Math.PI * 2,
  amp: 6 + rand(i, 26) * 14,
  born: rand(i, 27) * 90,
}));

const FRAGMENTS = THOUGHT_FRAGMENTS.map((text, i) => ({
  text,
  x: 30 + ((i * 73) % (W - 120)),
  y: 60 + ((i * 113) % (H - 80)),
  born: 60 + i * 18,
  driftPhase: rand(i, 31) * Math.PI * 2,
}));

export function ThoughtParticles({
  startFrame = 0,
  scale = 1,
}: ThoughtParticlesProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const t = local / 30; // seconds

  return (
    <svg
      width={W * scale}
      height={H * scale}
      viewBox={`0 0 ${W} ${H}`}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
    >
      {/* Curves */}
      {CURVES.map((c, i) => {
        const drawProgress = interpolate(local, [c.born, c.born + 48], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASING.smoothOut,
        });
        const dashOffset = (1 - drawProgress) * c.length;
        const drift = Math.sin(t * 0.6 + c.floatPhase) * 2;
        const opacity = interpolate(local, [c.born, c.born + 24], [0, 0.65], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <path
            key={i}
            d={c.d}
            stroke={c.color}
            strokeWidth={1}
            fill="none"
            strokeDasharray={c.length}
            strokeDashoffset={dashOffset}
            opacity={opacity}
            transform={`translate(0, ${drift})`}
          />
        );
      })}

      {/* Connection lines */}
      {CONNECTIONS.map((c, i) => {
        const opacity = interpolate(local, [c.born, c.born + 30], [0, 0.4], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <line
            key={i}
            x1={c.x1}
            y1={c.y1}
            x2={c.x2}
            y2={c.y2}
            stroke="#a78bfa"
            strokeWidth={0.7}
            opacity={opacity}
          />
        );
      })}

      {/* Tiny particles */}
      <g style={{ filter: "blur(1px)" }}>
        {PARTICLES.map((p, i) => {
          const opacity = interpolate(local, [p.born, p.born + 30], [0, 0.6], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const dx = Math.sin(t * 0.4 + p.floatX) * p.amp;
          const dy = Math.cos(t * 0.35 + p.floatY) * p.amp;
          return (
            <circle
              key={i}
              cx={p.cx + dx}
              cy={p.cy + dy}
              r={p.r}
              fill="#22d3ee"
              opacity={opacity}
            />
          );
        })}
      </g>

      {/* Text fragments */}
      {FRAGMENTS.map((f, i) => {
        const opacity = interpolate(local, [f.born, f.born + 24], [0, 0.55], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASING.smoothOut,
        });
        const drift = Math.sin(t * 0.4 + f.driftPhase) * 3;
        return (
          <text
            key={i}
            x={f.x}
            y={f.y + drift}
            fontFamily="'Pretendard Variable', sans-serif"
            fontSize={16}
            fontWeight={400}
            fill="#e2e8f0"
            opacity={opacity}
            style={{ filter: "blur(0.4px)" }}
          >
            {f.text}
          </text>
        );
      })}
    </svg>
  );
}
