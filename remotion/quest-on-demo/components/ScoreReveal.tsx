import type { ReactElement } from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, EASING, SPRINGS, TYPO } from "../constants";

export interface ScoreRevealProps {
  targetScore: number;
  startFrame: number;
  max?: number;
  size?: number;
  countUpFrames?: number;
}

export function ScoreReveal({
  targetScore,
  startFrame,
  max = 100,
  size = 280,
  countUpFrames = 14,
}: ScoreRevealProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - startFrame);

  // Bouncy entrance so the reveal feels rewarding, not mechanical.
  const enter = spring({
    frame: local,
    fps,
    config: SPRINGS.bouncy,
  });
  // Slight overshoot 0.55 → 1.06 → 1.0 keeps the punch without feeling cartoony.
  const scale = interpolate(enter, [0, 0.7, 1], [0.55, 1.06, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow intensity peaks 6 frames after the spring starts settling, then fades.
  const glow = interpolate(local, [0, 8, 22, 60], [0, 1, 0.55, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  // Ring sweep behind the digit — calculation-finished beat. Wider window so
  // capture timing does not matter as much.
  const ringScale = interpolate(local, [0, 26], [0.4, 1.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const ringOpacity = interpolate(local, [0, 10, 26, 40], [0, 0.7, 0.32, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const countProgress = interpolate(local, [0, countUpFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  // Last-frame micro-overshoot: targetScore → +1 → settle. Adds 1-frame tension beat.
  const overshoot = interpolate(
    local,
    [countUpFrames - 2, countUpFrames - 1, countUpFrames + 2],
    [0, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const display = Math.min(
    targetScore + 1,
    Math.round(targetScore * countProgress + overshoot),
  );

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "baseline",
        gap: 18,
        transform: `scale(${scale})`,
        transformOrigin: "left center",
        fontFamily: TYPO.fontFamily,
        letterSpacing: TYPO.letterSpacingTight,
        willChange: "transform",
      }}
    >
      {/* Ring sweep — calculation-finished beat behind the digit */}
      <div
        style={{
          position: "absolute",
          left: size * 0.5 - size * 0.85,
          top: -size * 0.15,
          width: size * 1.7,
          height: size * 1.3,
          borderRadius: "50%",
          border: "2px solid rgba(110,231,183,0.85)",
          boxShadow:
            "0 0 40px rgba(110,231,183,0.5), inset 0 0 24px rgba(34,211,238,0.35)",
          transform: `scale(${ringScale})`,
          transformOrigin: "center",
          opacity: ringOpacity,
          pointerEvents: "none",
          willChange: "transform, opacity",
        }}
      />
      <span
        style={{
          fontSize: size,
          fontWeight: 950,
          lineHeight: 1,
          background: COLORS.gradientPrimary,
          WebkitBackgroundClip: "text",
          color: "transparent",
          position: "relative",
          // Premium dashboard glow — visible but not gaming HUD.
          filter: `drop-shadow(0 0 ${20 * glow}px rgba(110, 231, 183, ${0.42 * glow})) drop-shadow(0 0 ${42 * glow}px rgba(34, 211, 238, ${0.30 * glow}))`,
        }}
      >
        {display}
      </span>
      <span
        style={{
          fontSize: size * 0.3,
          fontWeight: 800,
          color: COLORS.muted,
        }}
      >
        / {max}
      </span>
    </div>
  );
}
