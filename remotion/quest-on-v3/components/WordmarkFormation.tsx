import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";

export interface WordmarkFormationProps {
  startFrame?: number;
  durationFrames?: number;
  // Final wordmark text.
  text?: string;
  width?: number;
  height?: number;
}

// 200 particle target points distributed across an approximate "Quest-On"
// glyph footprint: 8 char columns x several rows. We approximate the path
// by scattering target points inside per-character bounding boxes.
const PARTICLE_COUNT = 200;
const CHAR_BOXES = [
  // Q, u, e, s, t, -, O, n
  { x: 70, y: 80, w: 90, h: 130 },
  { x: 175, y: 110, w: 75, h: 100 },
  { x: 265, y: 110, w: 75, h: 100 },
  { x: 355, y: 110, w: 75, h: 100 },
  { x: 445, y: 80, w: 60, h: 130 },
  { x: 520, y: 150, w: 36, h: 22 },
  { x: 575, y: 80, w: 100, h: 130 },
  { x: 690, y: 110, w: 75, h: 100 },
];

function rand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface Particle {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  delay: number;
  size: number;
}

const PARTICLES: Particle[] = (() => {
  const out: Particle[] = [];
  const charsTotal = CHAR_BOXES.length;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const charIdx = i % charsTotal;
    const box = CHAR_BOXES[charIdx]!;
    const tx = box.x + rand(i, 1) * box.w;
    const ty = box.y + rand(i, 2) * box.h;
    // Start far around target — random ring.
    const ang = rand(i, 3) * Math.PI * 2;
    const dist = 220 + rand(i, 4) * 320;
    const sx = tx + Math.cos(ang) * dist;
    const sy = ty + Math.sin(ang) * dist;
    out.push({
      startX: sx,
      startY: sy,
      targetX: tx,
      targetY: ty,
      delay: Math.floor(rand(i, 5) * 30),
      size: 1 + rand(i, 6) * 1.6,
    });
  }
  return out;
})();

export function WordmarkFormation({
  startFrame = 0,
  durationFrames = 90,
  text = "Quest-On",
  width = 840,
  height = 280,
}: WordmarkFormationProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Mask reveal of the actual SVG <text> follows particle attraction.
  const maskReveal = interpolate(
    local,
    [durationFrames * 0.55, durationFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 840 280"
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id="wf-particle">
          <stop offset="0%" stopColor="#fff" stopOpacity={1} />
          <stop offset="60%" stopColor="#22d3ee" stopOpacity={0.85} />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="wf-text" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity={1} />
          <stop offset="100%" stopColor="#34d399" stopOpacity={1} />
        </linearGradient>
        <mask id="wf-mask">
          <rect x={0} y={0} width={840} height={280} fill="black" />
          <text
            x="50%"
            y="58%"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="'Pretendard Variable', sans-serif"
            fontSize={140}
            fontWeight={700}
            letterSpacing="-0.04em"
            fill="white"
          >
            {text}
          </text>
        </mask>
      </defs>

      {/* Particles converging — masked by glyph silhouette */}
      <g mask="url(#wf-mask)">
        <rect x={0} y={0} width={840} height={280} fill="rgba(255,255,255,0)" />
        {PARTICLES.map((p, i) => {
          const t = interpolate(
            local,
            [p.delay, p.delay + 36],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASING.smoothOut,
            },
          );
          const x = p.startX + (p.targetX - p.startX) * t;
          const y = p.startY + (p.targetY - p.startY) * t;
          const op = interpolate(t, [0, 0.2, 1], [0, 0.85, 0.95], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={p.size + 2}
              fill="url(#wf-particle)"
              opacity={op}
            />
          );
        })}
      </g>

      {/* Stroke draw for definition */}
      <text
        x="50%"
        y="58%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Pretendard Variable', sans-serif"
        fontSize={140}
        fontWeight={700}
        letterSpacing="-0.04em"
        fill="none"
        stroke="url(#wf-text)"
        strokeWidth={1.2}
        opacity={maskReveal * 0.85}
        style={{ filter: "drop-shadow(0 0 6px rgba(34,211,238,0.45))" }}
      >
        {text}
      </text>

      {/* Final fill */}
      <text
        x="50%"
        y="58%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Pretendard Variable', sans-serif"
        fontSize={140}
        fontWeight={700}
        letterSpacing="-0.04em"
        fill="#f8fafc"
        opacity={maskReveal}
      >
        {text}
      </text>
    </svg>
  );
}
