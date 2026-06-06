import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BLACKBOX_GEOMETRY } from "./BlackBox";

export interface FractureSurfaceProps {
  startFrame?: number;
  // 0 -> 1 multiplier on coverage. Useful when Scene 3 keeps the lines visible
  // but they have already finished growing.
  forceComplete?: boolean;
}

const { size: BOX_SIZE, isoX: ISO_X, isoY: ISO_Y } = BLACKBOX_GEOMETRY;
const FRONT_X = ISO_X;
const FRONT_Y = ISO_Y * 2;

// 20 primary fracture paths radiating from a single origin point on the front
// face, plus 16 secondary hairline cracks layered underneath for density.
// Each path: { d: SVG path on front-face local coords, length: approx for dashoffset }.
type Crack = { d: string; length: number; born: number };

// origin: top-left corner of the front face, slight offset.
const ORIGIN_X = FRONT_X + 90;
const ORIGIN_Y = FRONT_Y + 80;

const CRACKS: Crack[] = [
  // Primary radial trunks (4) — born 0.
  { d: `M${ORIGIN_X},${ORIGIN_Y} L${FRONT_X + 230},${FRONT_Y + 160} L${FRONT_X + 320},${FRONT_Y + 240}`, length: 360, born: 0 },
  { d: `M${ORIGIN_X},${ORIGIN_Y} L${FRONT_X + 60},${FRONT_Y + 200} L${FRONT_X + 140},${FRONT_Y + 320}`, length: 320, born: 0 },
  { d: `M${ORIGIN_X},${ORIGIN_Y} L${FRONT_X + 200},${FRONT_Y + 30} L${FRONT_X + 310},${FRONT_Y + 60}`, length: 290, born: 0 },
  { d: `M${ORIGIN_X},${ORIGIN_Y} L${FRONT_X + 30},${FRONT_Y + 80} L${FRONT_X + 10},${FRONT_Y + 180}`, length: 240, born: 0 },
  // Two extra primary trunks (5,6) — fill the diagonals.
  { d: `M${ORIGIN_X},${ORIGIN_Y} L${FRONT_X + 270},${FRONT_Y + 80} L${FRONT_X + 340},${FRONT_Y + 130}`, length: 280, born: 6 },
  { d: `M${ORIGIN_X},${ORIGIN_Y} L${FRONT_X + 110},${FRONT_Y + 270} L${FRONT_X + 60},${FRONT_Y + 340}`, length: 300, born: 10 },
  // Branch wave 2 — start at intermediate points (7-12).
  { d: `M${FRONT_X + 230},${FRONT_Y + 160} L${FRONT_X + 290},${FRONT_Y + 90}`, length: 150, born: 24 },
  { d: `M${FRONT_X + 230},${FRONT_Y + 160} L${FRONT_X + 180},${FRONT_Y + 250}`, length: 160, born: 28 },
  { d: `M${FRONT_X + 60},${FRONT_Y + 200} L${FRONT_X + 110},${FRONT_Y + 280}`, length: 140, born: 30 },
  { d: `M${FRONT_X + 200},${FRONT_Y + 30} L${FRONT_X + 250},${FRONT_Y + 110}`, length: 150, born: 32 },
  { d: `M${FRONT_X + 270},${FRONT_Y + 80} L${FRONT_X + 230},${FRONT_Y + 30}`, length: 90, born: 34 },
  { d: `M${FRONT_X + 110},${FRONT_Y + 270} L${FRONT_X + 180},${FRONT_Y + 300}`, length: 110, born: 36 },
  // Branch wave 3 — secondary cracks (13-20).
  { d: `M${FRONT_X + 320},${FRONT_Y + 240} L${FRONT_X + 340},${FRONT_Y + 320}`, length: 110, born: 60 },
  { d: `M${FRONT_X + 140},${FRONT_Y + 320} L${FRONT_X + 220},${FRONT_Y + 340}`, length: 120, born: 65 },
  { d: `M${FRONT_X + 310},${FRONT_Y + 60} L${FRONT_X + 350},${FRONT_Y + 30}`, length: 100, born: 70 },
  { d: `M${FRONT_X + 10},${FRONT_Y + 180} L${FRONT_X + 50},${FRONT_Y + 260}`, length: 130, born: 72 },
  { d: `M${FRONT_X + 290},${FRONT_Y + 90} L${FRONT_X + 330},${FRONT_Y + 50}`, length: 80, born: 74 },
  { d: `M${FRONT_X + 60},${FRONT_Y + 340} L${FRONT_X + 30},${FRONT_Y + 280}`, length: 90, born: 76 },
  { d: `M${FRONT_X + 250},${FRONT_Y + 110} L${FRONT_X + 280},${FRONT_Y + 200}`, length: 100, born: 78 },
  { d: `M${FRONT_X + 180},${FRONT_Y + 300} L${FRONT_X + 240},${FRONT_Y + 280}`, length: 90, born: 80 },
];

// Secondary hairline cracks — short, faint, dense. Born across the second
// wave window to add granular texture without dominating the primary network.
const HAIRLINES: Crack[] = Array.from({ length: 16 }, (_, i) => {
  const ax = FRONT_X + 30 + ((i * 53) % (BOX_SIZE - 60));
  const ay = FRONT_Y + 30 + ((i * 89) % (BOX_SIZE - 60));
  const dx = ((i * 37) % 50) - 25;
  const dy = ((i * 71) % 50) - 25;
  const len = Math.max(40, Math.hypot(dx, dy) * 2);
  return {
    d: `M${ax},${ay} L${ax + dx},${ay + dy}`,
    length: len,
    born: 30 + (i % 8) * 4,
  };
});

// Debris particles — 18 total, emit through the second wave window.
const DEBRIS = Array.from({ length: 18 }, (_, i) => ({
  cx: FRONT_X + 40 + (i * 47) % (BOX_SIZE - 80),
  cy: FRONT_Y + 60 + (i * 73) % (BOX_SIZE - 100),
  born: 30 + i * 3,
  driftX: ((i * 17) % 36) - 18,
  driftY: -((i * 13) % 30) - 8,
  // Per-particle scale 1 -> 0.5 fade.
  startR: 1.4 + (i % 3) * 0.4,
}));

// Micro fragmentation shards — small displaced polygons hovering slightly off
// the cube surface during the fracture peak. 5 shards.
const MICRO_SHARDS = [
  { cx: FRONT_X + 100, cy: FRONT_Y + 110, dx: -2, dy: -1, born: 40 },
  { cx: FRONT_X + 230, cy: FRONT_Y + 90, dx: 2, dy: -1, born: 46 },
  { cx: FRONT_X + 280, cy: FRONT_Y + 200, dx: 1.5, dy: 1, born: 52 },
  { cx: FRONT_X + 150, cy: FRONT_Y + 260, dx: -1.5, dy: 1.5, born: 58 },
  { cx: FRONT_X + 80, cy: FRONT_Y + 220, dx: -2, dy: 0.5, born: 64 },
] as const;

// Total runtime baseline 360f for Scene 2. We map frames so 0 is the
// flash-point spark moment.
const SPARK_FRAME = 54; // 1.8s
const FIRST_WAVE_END = 144; // 4.8s
const FULL_COVERAGE = 300; // 10s

export function FractureSurface({
  startFrame = 0,
  forceComplete = false,
}: FractureSurfaceProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Initial spark.
  const sparkProgress = forceComplete
    ? 1
    : interpolate(local, [SPARK_FRAME, SPARK_FRAME + 8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASING.expoOut,
      });
  const sparkOpacity = forceComplete
    ? 0
    : interpolate(local, [SPARK_FRAME, SPARK_FRAME + 8, SPARK_FRAME + 26], [0, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  // End-of-scene pulse (rim flash).
  const pulse = forceComplete
    ? 0
    : interpolate(local, [330, 345, 360], [0, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={BOX_SIZE + ISO_X * 2}
        height={BOX_SIZE + ISO_Y * 2}
        viewBox={`0 0 ${BOX_SIZE + ISO_X * 2} ${BOX_SIZE + ISO_Y * 2}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="frac-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5ddee8" />
            <stop offset="100%" stopColor="#6ed8b0" />
          </linearGradient>
          <radialGradient id="frac-spark">
            <stop offset="0%" stopColor="#fff" stopOpacity={1} />
            <stop offset="40%" stopColor="#22d3ee" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Initial spark light at origin. */}
        <circle
          cx={ORIGIN_X}
          cy={ORIGIN_Y}
          r={28 * sparkProgress}
          fill="url(#frac-spark)"
          opacity={sparkOpacity}
        />

        {/* Hairline secondary cracks — faint, render UNDER primary cracks. */}
        {HAIRLINES.map((crack, i) => {
          const drawStart = SPARK_FRAME + crack.born;
          const drawEnd = drawStart + 30;
          const drawProgress = forceComplete
            ? 1
            : interpolate(local, [drawStart, drawEnd], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASING.smoothOut,
              });
          const dashOffset = (1 - drawProgress) * crack.length;
          const lineOpacity = forceComplete
            ? 0.5
            : interpolate(
                local,
                [drawStart, drawStart + 10, FULL_COVERAGE, FULL_COVERAGE + 30],
                [0, 0.5, 0.5, 0.4],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              );
          return (
            <path
              key={`hair-${i}`}
              d={crack.d}
              stroke="url(#frac-grad)"
              strokeWidth={1.5}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={crack.length}
              strokeDashoffset={dashOffset}
              opacity={lineOpacity}
            />
          );
        })}

        {/* Primary crack paths — thick, glowing, dominant. */}
        {CRACKS.map((crack, i) => {
          const drawStart = SPARK_FRAME + crack.born;
          const drawEnd = drawStart + 36;
          const drawProgress = forceComplete
            ? 1
            : interpolate(local, [drawStart, drawEnd], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASING.smoothOut,
              });
          const dashOffset = (1 - drawProgress) * crack.length;
          const lineOpacity = forceComplete
            ? 1
            : interpolate(
                local,
                [drawStart, drawStart + 12, FULL_COVERAGE, FULL_COVERAGE + 30],
                [0, 1, 1, 0.85],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              );
          // Trunks (first 6) are heavier; later branches taper down.
          const sw = i < 6 ? 3.4 : i < 12 ? 2.8 : 2.2;
          return (
            <path
              key={i}
              d={crack.d}
              stroke="url(#frac-grad)"
              strokeWidth={sw}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={crack.length}
              strokeDashoffset={dashOffset}
              opacity={lineOpacity}
              style={{ filter: `drop-shadow(0 0 5px rgba(34,211,238,${0.7 * lineOpacity}))` }}
            />
          );
        })}

        {/* Debris particles — scale 1 -> 0.5 fade as they drift. */}
        {DEBRIS.map((p, i) => {
          if (forceComplete) return null;
          const driftProgress = interpolate(local, [p.born, p.born + 60], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.smoothOut,
          });
          const opacity = interpolate(
            local,
            [p.born, p.born + 6, p.born + 60],
            [0, 1, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );
          const scale = interpolate(driftProgress, [0, 1], [1, 0.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const cx = p.cx + p.driftX * driftProgress;
          const cy = p.cy + p.driftY * driftProgress;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={p.startR * scale}
              fill="#34d399"
              opacity={opacity}
            />
          );
        })}

        {/* Micro fragmentation shards — small displaced polygons floating
            slightly off the surface during the fracture peak (~1s window). */}
        {MICRO_SHARDS.map((s, i) => {
          if (forceComplete) return null;
          const start = SPARK_FRAME + s.born;
          const peak = start + 30;
          const end = start + 90;
          const tx = interpolate(local, [start, peak], [0, s.dx], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.smoothOut,
          });
          const ty = interpolate(local, [start, peak], [0, s.dy], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.smoothOut,
          });
          const opacity = interpolate(
            local,
            [start, start + 8, peak, end],
            [0, 0.6, 0.6, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );
          // Triangle shard around (cx,cy).
          const r = 6;
          const points = `${s.cx + tx},${s.cy + ty - r} ${s.cx + tx + r},${s.cy + ty + r * 0.6} ${s.cx + tx - r * 0.8},${s.cy + ty + r * 0.4}`;
          return (
            <polygon
              key={`shard-${i}`}
              points={points}
              fill="url(#frac-grad)"
              opacity={opacity}
              style={{ filter: "drop-shadow(0 0 3px rgba(34,211,238,0.5))" }}
            />
          );
        })}

        {/* End pulse rim flash on the front face perimeter */}
        <rect
          x={FRONT_X}
          y={FRONT_Y}
          width={BOX_SIZE}
          height={BOX_SIZE}
          fill="none"
          stroke="url(#frac-grad)"
          strokeWidth={2}
          opacity={pulse * 0.9}
        />
      </svg>
    </div>
  );
}
