import type { ReactElement } from "react";

export interface HandSilhouetteProps {
  width?: number;
  height?: number;
  // Whether to show the keyboard glyph beneath the hand.
  withKeyboard?: boolean;
  // Inverted -> hand from top (instructor POV).
  inverted?: boolean;
  // Fill colour (typically near-black graphite).
  fill?: string;
  // Edge rim colour for cyan key-light.
  rim?: string;
  opacity?: number;
}

const HAND_PATH =
  // 5-finger hand, palm at bottom. Hand-drawn style smoothed cubic curves.
  // viewBox 0 0 400 260 (W x H). Wrist at y = 260, fingertips reach y = 24.
  "M 60 260 L 60 200 C 58 168, 70 140, 96 128 L 96 60 C 96 36, 116 24, 136 32 C 152 38, 156 50, 156 70 L 156 122 L 184 122 L 184 36 C 184 14, 204 4, 224 12 C 240 18, 244 30, 244 50 L 244 124 L 272 124 L 272 56 C 272 32, 292 22, 312 30 C 328 38, 332 50, 332 68 L 332 130 L 360 132 L 360 84 C 360 66, 376 56, 392 64 C 396 76, 396 130, 396 154 C 396 196, 366 240, 320 252 L 80 260 Z";

const KEYBOARD_KEYS = (() => {
  const keys: { x: number; y: number; w: number; h: number }[] = [];
  const cols = 12;
  const rows = 3;
  const kw = 28;
  const kh = 22;
  const pad = 4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      keys.push({
        x: 30 + c * (kw + pad) + (r % 2) * 8,
        y: 16 + r * (kh + pad),
        w: kw,
        h: kh,
      });
    }
  }
  return keys;
})();

export function HandSilhouette({
  width = 520,
  height = 360,
  withKeyboard = true,
  inverted = false,
  fill = "#02060e",
  rim = "rgba(34,211,238,0.55)",
  opacity = 0.92,
}: HandSilhouetteProps): ReactElement {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 480 360"
      style={{
        overflow: "visible",
        opacity,
        transform: inverted ? "scaleY(-1)" : undefined,
      }}
    >
      <defs>
        <linearGradient id="hand-rim" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={rim} />
          <stop offset="60%" stopColor="rgba(34,211,238,0.05)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </linearGradient>
        <filter id="hand-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {withKeyboard ? (
        <g opacity={0.55}>
          <rect
            x={20}
            y={260}
            width={440}
            height={88}
            rx={8}
            fill="#04080f"
            stroke="rgba(180,200,230,0.16)"
            strokeWidth={1}
          />
          <g transform="translate(20 260)">
            {KEYBOARD_KEYS.map((k, i) => (
              <rect
                key={i}
                x={k.x}
                y={k.y}
                width={k.w}
                height={k.h}
                rx={3}
                fill="#0a1322"
                stroke="rgba(180,200,230,0.12)"
                strokeWidth={0.6}
              />
            ))}
          </g>
        </g>
      ) : null}

      {/* Hand shadow */}
      <g transform="translate(40 14)">
        <path d={HAND_PATH} fill="#000" opacity={0.5} filter="url(#hand-shadow)" />
      </g>
      {/* Hand body */}
      <g transform="translate(40 14)">
        <path d={HAND_PATH} fill={fill} />
        {/* Rim highlight along upper edge */}
        <path
          d={HAND_PATH}
          fill="none"
          stroke="url(#hand-rim)"
          strokeWidth={1.2}
        />
      </g>
    </svg>
  );
}
