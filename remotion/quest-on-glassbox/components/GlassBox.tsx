import type { ReactElement, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BLACKBOX_GEOMETRY } from "./BlackBox";

export interface GlassBoxProps {
  // Frame at which crystallisation begins.
  startFrame?: number;
  // 0 = no crystallisation (still graphite), 1 = fully glass. Driven by parent.
  // If omitted, the component drives its own progression based on local frame.
  progress?: number;
  // Children float inside the front face (via the inner slot).
  children?: ReactNode;
}

const { size: BOX_SIZE, isoX: ISO_X, isoY: ISO_Y } = BLACKBOX_GEOMETRY;
const FRONT_X = ISO_X;
const FRONT_Y = ISO_Y * 2;

export function GlassBox({
  startFrame = 0,
  progress,
  children,
}: GlassBoxProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Default crystallisation curve: 10% spread, 10–50% growing, 50%+ steady.
  const autoProgress = interpolate(local, [0, 54, 270], [0, 0.05, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const p = progress ?? autoProgress;

  // Subtle 1.5% breathing — kicks in once crystallised.
  const breathRamp = interpolate(p, [0.7, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const breathScale = 1 + Math.sin(local * 0.06) * 0.015 * breathRamp;

  // Stroke + fill alpha grow with progress.
  const strokeAlpha = interpolate(p, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fillAlpha = interpolate(p, [0, 1], [0, 0.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // The graphite "old skin" cross-fades out as glass grows.
  const graphiteAlpha = interpolate(p, [0, 0.6], [1, 0], {
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
        transform: `scale(${breathScale})`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: BOX_SIZE + ISO_X * 2,
          height: BOX_SIZE + ISO_Y * 2,
        }}
      >
        <svg
          width={BOX_SIZE + ISO_X * 2}
          height={BOX_SIZE + ISO_Y * 2}
          viewBox={`0 0 ${BOX_SIZE + ISO_X * 2} ${BOX_SIZE + ISO_Y * 2}`}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          <defs>
            <linearGradient id="gb-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#5ddee8" />
              <stop offset="100%" stopColor="#6ed8b0" />
            </linearGradient>
            <linearGradient id="gb-fill-front" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={fillAlpha * 1.4} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={fillAlpha * 0.6} />
            </linearGradient>
            <linearGradient id="gb-fill-top" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity={fillAlpha * 0.9} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={fillAlpha * 0.6} />
            </linearGradient>
            <linearGradient id="gb-fill-left" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={fillAlpha * 0.4} />
              <stop offset="100%" stopColor="#0e1728" stopOpacity={fillAlpha * 0.6} />
            </linearGradient>
          </defs>

          {/* Graphite skin cross-fading out */}
          <g opacity={graphiteAlpha}>
            <polygon
              points={`${ISO_X},${ISO_Y * 2} ${ISO_X + BOX_SIZE},${ISO_Y * 2} ${ISO_X + BOX_SIZE - ISO_X},${ISO_Y} ${0},${ISO_Y}`}
              fill="#0a1428"
            />
            <polygon
              points={`${ISO_X},${ISO_Y * 2} ${ISO_X},${ISO_Y * 2 + BOX_SIZE} ${0},${ISO_Y + BOX_SIZE} ${0},${ISO_Y}`}
              fill="#070d1a"
            />
            <rect
              x={ISO_X}
              y={ISO_Y * 2}
              width={BOX_SIZE}
              height={BOX_SIZE}
              fill="#0e1728"
            />
          </g>

          {/* Glass faces — fills */}
          <polygon
            points={`${ISO_X},${ISO_Y * 2} ${ISO_X + BOX_SIZE},${ISO_Y * 2} ${ISO_X + BOX_SIZE - ISO_X},${ISO_Y} ${0},${ISO_Y}`}
            fill="url(#gb-fill-top)"
          />
          <polygon
            points={`${ISO_X},${ISO_Y * 2} ${ISO_X},${ISO_Y * 2 + BOX_SIZE} ${0},${ISO_Y + BOX_SIZE} ${0},${ISO_Y}`}
            fill="url(#gb-fill-left)"
          />
          <rect
            x={FRONT_X}
            y={FRONT_Y}
            width={BOX_SIZE}
            height={BOX_SIZE}
            fill="url(#gb-fill-front)"
          />

          {/* Glass strokes — crystal edges */}
          <polygon
            points={`${ISO_X},${ISO_Y * 2} ${ISO_X + BOX_SIZE},${ISO_Y * 2} ${ISO_X + BOX_SIZE - ISO_X},${ISO_Y} ${0},${ISO_Y}`}
            fill="none"
            stroke="url(#gb-stroke)"
            strokeWidth={1.5}
            strokeOpacity={strokeAlpha}
          />
          <polygon
            points={`${ISO_X},${ISO_Y * 2} ${ISO_X},${ISO_Y * 2 + BOX_SIZE} ${0},${ISO_Y + BOX_SIZE} ${0},${ISO_Y}`}
            fill="none"
            stroke="url(#gb-stroke)"
            strokeWidth={1.5}
            strokeOpacity={strokeAlpha}
          />
          <rect
            x={FRONT_X}
            y={FRONT_Y}
            width={BOX_SIZE}
            height={BOX_SIZE}
            fill="none"
            stroke="url(#gb-stroke)"
            strokeWidth={1.5}
            strokeOpacity={strokeAlpha}
          />

          {/* Internal crystallisation veins — same paths as cracks but glow brighter */}
          <g opacity={strokeAlpha * 0.85}>
            <path
              d={`M${FRONT_X + 90},${FRONT_Y + 80} L${FRONT_X + 230},${FRONT_Y + 160} L${FRONT_X + 320},${FRONT_Y + 240}`}
              stroke="#34d399"
              strokeWidth={1}
              fill="none"
              opacity={0.6}
            />
            <path
              d={`M${FRONT_X + 90},${FRONT_Y + 80} L${FRONT_X + 60},${FRONT_Y + 200}`}
              stroke="#22d3ee"
              strokeWidth={1}
              fill="none"
              opacity={0.6}
            />
            <path
              d={`M${FRONT_X + 90},${FRONT_Y + 80} L${FRONT_X + 200},${FRONT_Y + 30}`}
              stroke="#34d399"
              strokeWidth={1}
              fill="none"
              opacity={0.6}
            />
          </g>
        </svg>

        {/* Children float inside the front face rectangle. */}
        <div
          style={{
            position: "absolute",
            left: FRONT_X,
            top: FRONT_Y,
            width: BOX_SIZE,
            height: BOX_SIZE,
            overflow: "hidden",
            opacity: strokeAlpha,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export const GLASSBOX_INNER = {
  width: BOX_SIZE,
  height: BOX_SIZE,
} as const;
