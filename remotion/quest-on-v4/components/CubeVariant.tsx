import type { CSSProperties, ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";

// Variants that don't fit the BoxV4 6-face render path.
// Implemented as SVG / CSS so we can drive them with one prop.

export type CubeVariantKind =
  | "V1-wireframe" // Crystallizing wireframe lines
  | "V3-cross-section" // Cube sliced — internal layers exposed
  | "V4-exploded" // 6 faces flying outward with thin labels
  | "V8-constellation"; // Already covered by Constellation, but we expose a thin wrapper.

export interface CubeVariantProps {
  kind: CubeVariantKind;
  size?: number;
  // Reveal progress 0..1 (caller drives via interpolate).
  progress?: number;
  startFrame?: number;
}

// V1: wireframe edges drawing in via stroke-dashoffset.
// 12 edges of a cube projected to 2D iso.
const ISO_VERTS = (() => {
  // 8 vertices of a unit cube at iso projection.
  const f = 0.5;
  const cosA = Math.cos((30 * Math.PI) / 180);
  const sinA = Math.sin((30 * Math.PI) / 180);
  // 8 cube corners in 3D, scaled to f.
  const cube3 = [
    [-f, -f, -f],
    [f, -f, -f],
    [f, f, -f],
    [-f, f, -f],
    [-f, -f, f],
    [f, -f, f],
    [f, f, f],
    [-f, f, f],
  ];
  // Iso projection: x = (x - z) * cosA, y = y - (x + z) * sinA
  return cube3.map(([x, y, z]) => [
    (x - z) * cosA,
    y - (x + z) * sinA,
  ]);
})();
const ISO_EDGES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

function WireframeCube({
  size,
  progress,
}: {
  size: number;
  progress: number;
}): ReactElement {
  // Bring iso verts to viewBox coords.
  const vb = 320;
  const half = vb / 2;
  const scale = vb * 0.42;
  const projected = ISO_VERTS.map(([x, y]) => [
    half + (x ?? 0) * scale,
    half + (y ?? 0) * scale,
  ]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="wf-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={QUESTON_BRAND.primaryLight} />
          <stop offset="100%" stopColor={QUESTON_BRAND.primaryDeep} />
        </linearGradient>
        <filter id="wf-glow">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      {ISO_EDGES.map(([a, b], i) => {
        const pa = projected[a];
        const pb = projected[b];
        if (!pa || !pb) return null;
        const len = Math.hypot((pb[0] ?? 0) - (pa[0] ?? 0), (pb[1] ?? 0) - (pa[1] ?? 0));
        // Stagger edges — 12 edges over progress 0..1 with overlap.
        const start = i / 12;
        const end = start + 0.45;
        const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
        return (
          <g key={i}>
            <line
              x1={pa[0]}
              y1={pa[1]}
              x2={pb[0]}
              y2={pb[1]}
              stroke="url(#wf-stroke)"
              strokeWidth={2.2}
              strokeDasharray={len}
              strokeDashoffset={(1 - t) * len}
              filter="url(#wf-glow)"
              opacity={0.55 * t}
            />
            <line
              x1={pa[0]}
              y1={pa[1]}
              x2={pb[0]}
              y2={pb[1]}
              stroke={QUESTON_BRAND.primaryLight}
              strokeWidth={1.1}
              strokeDasharray={len}
              strokeDashoffset={(1 - t) * len}
              opacity={0.95 * t}
            />
          </g>
        );
      })}
      {projected.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={2.4 * progress}
          fill="#fff"
          opacity={progress}
        />
      ))}
    </svg>
  );
}

function CrossSection({ size, progress }: { size: number; progress: number }): ReactElement {
  // V3: cube cut diagonally; expose 4-5 layered strata representing time.
  const vb = 320;
  // Strata thickness shrinks toward the centre — gives a depth feel.
  const layers = [0, 1, 2, 3, 4];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="cs-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={QUESTON_BRAND.primaryLight} stopOpacity={0.6} />
          <stop offset="100%" stopColor={QUESTON_BRAND.primaryDeep} stopOpacity={0.85} />
        </linearGradient>
        <linearGradient id="cs-edge" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={QUESTON_BRAND.primaryLight} stopOpacity={0.95} />
          <stop offset="100%" stopColor={QUESTON_BRAND.primary} stopOpacity={0.4} />
        </linearGradient>
      </defs>

      {/* Solid back side */}
      <polygon
        points="80,260 60,80 200,40 220,220"
        fill="#0c1224"
        stroke="rgba(87,205,255,0.4)"
        strokeWidth={1}
        opacity={progress}
      />
      {/* Strata */}
      {layers.map((k) => {
        const t = Math.max(0, Math.min(1, progress * 1.3 - k * 0.12));
        const off = k * 14;
        const top = 92 + off;
        const bottom = 248 - off;
        return (
          <g key={k} opacity={t}>
            <polygon
              points={`80,${bottom} 60,${top} 200,${top - 40} 220,${bottom - 40}`}
              fill="url(#cs-fill)"
              opacity={0.6 + k * 0.06}
            />
            <line
              x1={80}
              y1={bottom}
              x2={220}
              y2={bottom - 40}
              stroke={QUESTON_BRAND.primaryLight}
              strokeWidth={0.8}
              opacity={0.5}
            />
          </g>
        );
      })}

      {/* Cut highlight edge */}
      <line
        x1={220}
        y1={40}
        x2={220}
        y2={220}
        stroke="url(#cs-edge)"
        strokeWidth={2}
        opacity={progress}
      />

      {/* Floating data nodes inside strata */}
      {[
        [120, 100],
        [150, 140],
        [110, 180],
        [170, 200],
        [140, 220],
      ].map((pt, i) => {
        const t = Math.max(0, Math.min(1, progress * 1.1 - i * 0.12));
        const px = pt[0] ?? 0;
        const py = pt[1] ?? 0;
        return (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={2.2 * t}
            fill="#fff"
            opacity={t}
          />
        );
      })}
    </svg>
  );
}

function ExplodedBlueprint({
  size,
  progress,
}: {
  size: number;
  progress: number;
}): ReactElement {
  // V4: 6 thin square planes flying outward from centre.
  const labels = [
    "문제",
    "AI 대화",
    "답안",
    "사고 궤적",
    "AI 평가",
    "최종 점수",
  ];
  const facePx = size * 0.28;
  const distances = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
    [0.7, -0.7],
    [-0.7, 0.7],
  ] as const;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 0,
        height: 0,
      }}
    >
      {distances.map((d, i) => {
        const driveT = Math.max(0, Math.min(1, progress * 1.1 - i * 0.04));
        const dist = lerp(0, size * 0.42, driveT);
        const tx = (d[0] ?? 0) * dist;
        const ty = (d[1] ?? 0) * dist;
        const rot = lerp(0, 18 + i * 6, driveT);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: facePx,
              height: facePx,
              left: -facePx / 2,
              top: -facePx / 2,
              transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg)`,
              borderRadius: 10,
              border: `1.5px solid ${QUESTON_BRAND.primaryLight}`,
              background:
                "linear-gradient(135deg, rgba(87,205,255,0.06) 0%, rgba(47,70,185,0.10) 100%)",
              boxShadow: `0 0 30px -6px ${QUESTON_BRAND.primarySoft}`,
              opacity: driveT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                color: QUESTON_BRAND.primaryLight,
                fontFamily: QUESTON_BRAND.fontFamily,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                opacity: 0.9,
              }}
            >
              {labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function CubeVariant({
  kind,
  size = 460,
  progress,
  startFrame = 0,
}: CubeVariantProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const driven =
    progress ??
    interpolate(local, [0, 60], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    });

  const wrap: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: size,
    height: size,
    marginLeft: -size / 2,
    marginTop: -size / 2,
  };

  if (kind === "V1-wireframe") {
    return (
      <div style={wrap}>
        <WireframeCube size={size} progress={driven} />
      </div>
    );
  }
  if (kind === "V3-cross-section") {
    return (
      <div style={wrap}>
        <CrossSection size={size} progress={driven} />
      </div>
    );
  }
  if (kind === "V4-exploded") {
    return (
      <div style={wrap}>
        <ExplodedBlueprint size={size} progress={driven} />
      </div>
    );
  }
  // V8 constellation handled by external Constellation component.
  return <div style={wrap} />;
}
