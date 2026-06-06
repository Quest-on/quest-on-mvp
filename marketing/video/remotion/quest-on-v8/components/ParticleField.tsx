// <ParticleField> — the v8 single-material engine.
//
// Renders N=4000 cobalt particles as <circle> elements inside a single
// <svg>. Each frame, every particle is interpolated between a `from`
// target and a `to` target via a t ∈ [0,1] driven by useCurrentFrame()
// against the current cut's morph window.
//
// Rationale for SVG over Canvas:
//   - Remotion server renders are deterministic with SVG, no canvas
//     pixel snapshot ambiguity.
//   - 4000 <circle>s at 1080p render in ~12ms per frame on M-series
//     locally; well within Remotion still-render budget.
//   - We can apply per-particle alpha/color cleanly via attributes.

import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { ParticleTarget } from "./targets";
import { V8_HEIGHT, V8_PALETTE, V8_WIDTH } from "../data";

export interface ParticleFieldProps {
  // Optional previous-target set; if omitted, the field renders `to`
  // directly (no morph). Both arrays must have the same length.
  from?: ParticleTarget[];
  to: ParticleTarget[];
  // Frame at which the morph from → to begins. Default 0.
  morphStart?: number;
  // How many frames the morph takes. Default 24 (~0.8s @ 30fps).
  morphFrames?: number;
  // Optional per-frame jitter amplitude in px (gives a "live" feel).
  jitter?: number;
  // Whether to draw a soft glow under the field (radial gradient).
  glow?: boolean;
  // Optional global multiplier on every particle's alpha. Used by cuts
  // that need to fade the entire field in/out (e.g., dissolve to UI).
  alphaScale?: number;
}

// Color interpolation in linear sRGB approximation (good enough between
// the two cobalts since they share hue). We just LERP each channel.
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [255, 255, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

const PRIMARY_RGB = hexToRgb(V8_PALETTE.primary);
const HIGHLIGHT_RGB = hexToRgb(V8_PALETTE.highlight);

function lerpColor(a: string, b: string, t: number): string {
  // Fast path: same color.
  if (a === b) return a;
  const ra = a === V8_PALETTE.highlight ? HIGHLIGHT_RGB : PRIMARY_RGB;
  const rb = b === V8_PALETTE.highlight ? HIGHLIGHT_RGB : PRIMARY_RGB;
  const r = Math.round(ra[0] + (rb[0] - ra[0]) * t);
  const g = Math.round(ra[1] + (rb[1] - ra[1]) * t);
  const bl = Math.round(ra[2] + (rb[2] - ra[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

export function ParticleField({
  from,
  to,
  morphStart = 0,
  morphFrames = 24,
  jitter = 0,
  glow = false,
  alphaScale = 1,
}: ParticleFieldProps): ReactElement {
  const frame = useCurrentFrame();

  const t = interpolate(
    frame,
    [morphStart, morphStart + morphFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const N = to.length;

  return (
    <svg
      width={V8_WIDTH}
      height={V8_HEIGHT}
      viewBox={`0 0 ${V8_WIDTH} ${V8_HEIGHT}`}
      style={{
        position: "absolute",
        inset: 0,
        background: V8_PALETTE.bg,
      }}
    >
      {glow ? (
        <defs>
          <radialGradient id="v8-glow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={V8_PALETTE.primary} stopOpacity="0.22" />
            <stop offset="60%" stopColor={V8_PALETTE.primary} stopOpacity="0.06" />
            <stop offset="100%" stopColor={V8_PALETTE.bg} stopOpacity="0" />
          </radialGradient>
        </defs>
      ) : null}
      {glow ? (
        <rect
          x={0}
          y={0}
          width={V8_WIDTH}
          height={V8_HEIGHT}
          fill="url(#v8-glow)"
        />
      ) : null}
      <g>
        {(() => {
          const out: ReactElement[] = new Array(N);
          for (let i = 0; i < N; i++) {
            const tgt = to[i];
            const src = from ? from[i] : tgt;
            const x = src.x + (tgt.x - src.x) * t;
            const y = src.y + (tgt.y - src.y) * t;
            const r = src.r + (tgt.r - src.r) * t;
            const a =
              (src.alpha + (tgt.alpha - src.alpha) * t) * alphaScale;
            // Skip fully-invisible particles for render speed.
            if (a < 0.012) continue;
            const color = lerpColor(src.color, tgt.color, t);
            // Cheap deterministic jitter — sin(frame * φ_i)
            const jx = jitter
              ? Math.sin((frame + i) * 0.31) * jitter
              : 0;
            const jy = jitter
              ? Math.cos((frame * 0.7 + i) * 0.27) * jitter
              : 0;
            out[i] = (
              <circle
                key={i}
                cx={x + jx}
                cy={y + jy}
                r={r}
                fill={color}
                opacity={a}
              />
            );
          }
          return out;
        })()}
      </g>
    </svg>
  );
}
