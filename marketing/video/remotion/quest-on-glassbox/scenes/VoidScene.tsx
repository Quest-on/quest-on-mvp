import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, EASING, TYPO } from "../../quest-on-demo/constants";
import {
  GradientMesh,
  PerspectiveStage,
} from "../../quest-on-demo/components";
import { BlackBox, KineticType } from "../components";
import { GLASSBOX_COPY } from "../data";

// Scene 1 — Void. 420f / 14s @ 30fps.
// PerspectiveStage Z 1.00 -> 1.15 over 14s. Copy enters at 75% (315f).
const COPY_START = 315;

export function VoidScene(): ReactElement {
  const frame = useCurrentFrame();

  // translateZ in px equivalent: PerspectiveStage children push toward camera.
  // CSS perspective is 1400px; we tween a child scale with matching feel.
  const pushScale = interpolate(frame, [0, 420], [1, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  const copyOpacity = interpolate(frame, [COPY_START, COPY_START + 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const copyY = interpolate(frame, [COPY_START, COPY_START + 48], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background: "#000000",
        fontFamily: TYPO.fontFamily,
        color: COLORS.ink,
        overflow: "hidden",
      }}
    >
      {/* Background depth — 5% gradient mesh */}
      <AbsoluteFill style={{ opacity: 0.05 }}>
        <GradientMesh tone="cool" intensity={1} />
      </AbsoluteFill>

      <PerspectiveStage perspective={1400}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${pushScale})`,
            transformStyle: "preserve-3d",
          }}
        >
          <BlackBox startFrame={0} />
        </div>
      </PerspectiveStage>

      {/* Copy — bottom-aligned, 64px below the box (box footprint ~480px tall, centred). */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          paddingBottom: 200,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            opacity: copyOpacity,
            transform: `translateY(${copyY}px)`,
            fontSize: 60,
            fontWeight: 600,
            letterSpacing: TYPO.letterSpacingTight,
            color: COLORS.muted,
            lineHeight: TYPO.lineHeightTitle,
          }}
        >
          <KineticType
            text={GLASSBOX_COPY.void}
            startFrame={COPY_START}
            staggerSeconds={0.04}
            perCharFrames={18}
            yOffset={6}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
