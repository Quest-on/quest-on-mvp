import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";

export interface BlackBoxProps {
  startFrame?: number;
  // Whether the rim light has already faded in (used by the Fracture scene to
  // continue from a fully-lit state without re-running the fade).
  rimAlwaysOn?: boolean;
  // Optional scale multiplier (Scene 3 uses this when the box morphs).
  scale?: number;
}

// Isometric 3-face cube (front + left + top). SVG only, no WebGL.
// Frame-driven micro-vibration starts ~3.5s in, surface-noise glyph shadow at ~7s.
const BOX_SIZE = 360; // px footprint of front face
const ISO_X = 110; // top/left face skew x
const ISO_Y = 60; // top/left face skew y

const NOISE_GLYPHS = [
  "X",
  "?",
  "≈",
  "△",
  "Y",
  "∂",
  "○",
  "+",
  "—",
  "/",
  "◇",
  "Σ",
];

export function BlackBox({
  startFrame = 0,
  rimAlwaysOn = false,
  scale = 1,
}: BlackBoxProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Rim light fade-in (0 -> 1.4s).
  const rimOpacity = rimAlwaysOn
    ? 0.85
    : interpolate(local, [0, 42], [0, 0.85], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASING.smoothOut,
      });

  // Micro-vibration kicks in at 3.5s (105f). 3px amplitude, 6Hz sin.
  const vibStart = 105;
  const vibRamp = interpolate(local, [vibStart, vibStart + 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const vibX = Math.sin(local * 0.4) * 3 * vibRamp;
  const vibY = Math.cos(local * 0.42) * 2 * vibRamp;

  // Surface noise glyph layer fades in at 7s (210f).
  const noiseOpacity = interpolate(local, [210, 270], [0, 0.14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glyph drift offset (slow vertical scroll for the noise layer).
  const glyphDrift = (local * 0.35) % 60;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `translate(${vibX}px, ${vibY}px) scale(${scale})`,
      }}
    >
      <svg
        width={BOX_SIZE + ISO_X * 2}
        height={BOX_SIZE + ISO_Y * 2}
        viewBox={`0 0 ${BOX_SIZE + ISO_X * 2} ${BOX_SIZE + ISO_Y * 2}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="bb-front" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#142036" />
            <stop offset="50%" stopColor="#0d172c" />
            <stop offset="100%" stopColor="#070d1c" />
          </linearGradient>
          <linearGradient id="bb-top" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#152138" />
            <stop offset="100%" stopColor="#0a1428" />
          </linearGradient>
          <linearGradient id="bb-left" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#070d1a" />
            <stop offset="100%" stopColor="#020610" />
          </linearGradient>
          <clipPath id="bb-front-clip">
            <polygon
              points={`${ISO_X},${ISO_Y * 2} ${ISO_X + BOX_SIZE},${ISO_Y * 2} ${ISO_X + BOX_SIZE},${ISO_Y * 2 + BOX_SIZE} ${ISO_X},${ISO_Y * 2 + BOX_SIZE}`}
            />
          </clipPath>
        </defs>

        {/* Top face (parallelogram) */}
        <polygon
          points={`${ISO_X},${ISO_Y * 2} ${ISO_X + BOX_SIZE},${ISO_Y * 2} ${ISO_X + BOX_SIZE - ISO_X},${ISO_Y} ${0},${ISO_Y}`}
          fill="url(#bb-top)"
        />
        {/* Left face (parallelogram). Visually it sits to the LEFT of the front, */}
        {/* so we use the left edge of the front (x = ISO_X) as anchor. */}
        <polygon
          points={`${ISO_X},${ISO_Y * 2} ${ISO_X},${ISO_Y * 2 + BOX_SIZE} ${0},${ISO_Y + BOX_SIZE} ${0},${ISO_Y}`}
          fill="url(#bb-left)"
        />
        {/* Front face */}
        <rect
          x={ISO_X}
          y={ISO_Y * 2}
          width={BOX_SIZE}
          height={BOX_SIZE}
          fill="url(#bb-front)"
        />

        {/* Surface noise glyphs — clipped to the front face. */}
        <g
          clipPath="url(#bb-front-clip)"
          opacity={noiseOpacity}
          style={{ filter: "blur(0.4px)" }}
        >
          {NOISE_GLYPHS.map((g, i) => {
            const col = i % 4;
            const row = Math.floor(i / 4);
            const x = ISO_X + 40 + col * 90;
            const y = ISO_Y * 2 + 60 + row * 110 + glyphDrift;
            return (
              <text
                key={`${g}-${i}`}
                x={x}
                y={y}
                fontFamily="'Pretendard Variable', sans-serif"
                fontSize={36}
                fill="#22d3ee"
                opacity={0.6}
              >
                {g}
              </text>
            );
          })}
        </g>

        {/* Rim light: top-left edge */}
        <polyline
          points={`0,${ISO_Y} ${BOX_SIZE},${ISO_Y}`}
          stroke="#9bb6d3"
          strokeWidth={1.5}
          fill="none"
          opacity={rimOpacity}
        />
        <polyline
          points={`0,${ISO_Y} ${ISO_X},${ISO_Y * 2}`}
          stroke="#9bb6d3"
          strokeWidth={1.5}
          fill="none"
          opacity={rimOpacity}
        />
        <polyline
          points={`0,${ISO_Y} ${0},${ISO_Y + BOX_SIZE}`}
          stroke="#9bb6d3"
          strokeWidth={1.5}
          fill="none"
          opacity={rimOpacity * 0.55}
        />

        {/* Rim light: bottom-right edge (warmer / weaker fresnel) */}
        <polyline
          points={`${ISO_X + BOX_SIZE},${ISO_Y * 2 + BOX_SIZE} ${ISO_X},${ISO_Y * 2 + BOX_SIZE}`}
          stroke="#5b6f8a"
          strokeWidth={1.5}
          fill="none"
          opacity={rimOpacity * 0.85}
        />
        <polyline
          points={`${ISO_X + BOX_SIZE},${ISO_Y * 2} ${ISO_X + BOX_SIZE},${ISO_Y * 2 + BOX_SIZE}`}
          stroke="#5b6f8a"
          strokeWidth={1.5}
          fill="none"
          opacity={rimOpacity * 0.85}
        />
      </svg>
    </div>
  );
}

export const BLACKBOX_GEOMETRY = {
  size: BOX_SIZE,
  isoX: ISO_X,
  isoY: ISO_Y,
} as const;
