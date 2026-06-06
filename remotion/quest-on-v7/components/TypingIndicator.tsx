import type { CSSProperties, ReactElement } from "react";
import { useCurrentFrame } from "remotion";
import { QUESTON_BRAND } from "../brand";

export interface TypingIndicatorProps {
  // Frame at which the indicator starts pulsing.
  startFrame: number;
  // How long the indicator stays visible (frames). Default 30 (1s @ 30fps).
  durationFrames?: number;
  // Diameter of each dot in px. Default 8.
  size?: number;
  // Dot fill color. Defaults to Quest-On cobalt.
  color?: string;
  // Optional style overrides on the wrapper.
  style?: CSSProperties;
}

const DOT_PHASES = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3] as const;

// Three dots pulsing with a 120° phase offset — the canonical "AI is typing"
// affordance. Frame-driven so it renders deterministically in Remotion.
export function TypingIndicator({
  startFrame,
  durationFrames = 30,
  size = 8,
  color = QUESTON_BRAND.primary,
  style,
}: TypingIndicatorProps): ReactElement | null {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  if (local < 0 || local >= durationFrames) {
    return null;
  }
  // 0.45s per cycle so each dot sees ~13 frames per pulse.
  const phaseRate = (2 * Math.PI) / 13;

  return (
    <div
      style={{
        display: "inline-flex",
        gap: size * 0.6,
        alignItems: "center",
        ...style,
      }}
    >
      {DOT_PHASES.map((phase, i) => {
        const wave = Math.sin(local * phaseRate + phase);
        const opacity = 0.3 + (wave * 0.5 + 0.5) * 0.7;
        const scale = 0.85 + (wave * 0.5 + 0.5) * 0.3;
        return (
          <span
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              opacity,
              transform: `scale(${scale})`,
              display: "inline-block",
            }}
          />
        );
      })}
    </div>
  );
}
