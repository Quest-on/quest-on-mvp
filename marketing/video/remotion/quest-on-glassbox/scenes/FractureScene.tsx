import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, EASING, TYPO } from "../../quest-on-demo/constants";
import {
  GradientMesh,
  PerspectiveStage,
  MaskReveal,
} from "../../quest-on-demo/components";
import { BlackBox, FractureSurface } from "../components";
import { GLASSBOX_COPY } from "../data";

// Scene 2 — Fracture. 360f / 12s @ 30fps.
// Static camera. Cracks build, copy "보이지 않는다." reveals via MaskReveal at 65%.
const COPY_START = 234; // 7.8s

// Wow peak — punch moment right after cracks cover the face (frame 75-92).
const PEAK_START = 75;
const PEAK_MID = 84;
const PEAK_END = 92;

export function FractureScene(): ReactElement {
  const frame = useCurrentFrame();

  // The end-of-scene rim pulse also brightens the box edge for one frame.
  const pulseBoost = interpolate(frame, [330, 345, 360], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Copy holds at 1 once it's revealed.
  const copyOpacity = interpolate(frame, [COPY_START, COPY_START + 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  // Cube scale punch: 1.0 → 1.10 → 1.0 over ~12 frames (triangle).
  const peakScale = interpolate(
    frame,
    [PEAK_START, PEAK_MID, PEAK_END],
    [1, 1.1, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  // Camera shake — ±4px sin/cos wave during the peak (frames 75-85).
  const shakeRamp = interpolate(
    frame,
    [PEAK_START, PEAK_START + 2, PEAK_START + 8, PEAK_START + 10],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const shakeX = Math.sin((frame - PEAK_START) * 1.6) * 4 * shakeRamp;
  const shakeY = Math.cos((frame - PEAK_START) * 1.9) * 4 * shakeRamp;

  // Cyan flash overlay opacity 0 → 0.65 → 0 (frame 78-92, 14 frames).
  const flashOpacity = interpolate(
    frame,
    [PEAK_START + 3, PEAK_MID, PEAK_END],
    [0, 0.65, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill
      style={{
        background: "#000000",
        fontFamily: TYPO.fontFamily,
        color: COLORS.ink,
        overflow: "hidden",
      }}
    >
      {/* Background depth */}
      <AbsoluteFill style={{ opacity: 0.07 }}>
        <GradientMesh tone="cool" intensity={1} />
      </AbsoluteFill>

      <PerspectiveStage perspective={1400}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${shakeX}px, ${shakeY}px) scale(${1.15 * peakScale})`,
            transformStyle: "preserve-3d",
          }}
        >
          {/* Continue from the Void scene with rim already lit. */}
          <BlackBox startFrame={0} rimAlwaysOn />
          <FractureSurface startFrame={0} />

          {/* End-pulse boost on the box outline */}
          <AbsoluteFill
            style={{
              pointerEvents: "none",
              boxShadow: `inset 0 0 0 1px rgba(34,211,238,${pulseBoost * 0.4})`,
              mixBlendMode: "screen",
              opacity: pulseBoost,
            }}
          />
        </div>
      </PerspectiveStage>

      {/* Wow-peak cyan flash — radial burst centred on the cube. */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.45), transparent 60%)",
          mixBlendMode: "screen",
          opacity: flashOpacity,
        }}
      />

      {/* Copy — front and centre, masked by a horizontal slice that mimics the cracks. */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          opacity: copyOpacity,
        }}
      >
        <MaskReveal startFrame={COPY_START} durationFrames={36} shape="inset" from="left">
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: COLORS.ink,
              lineHeight: TYPO.lineHeightTitle,
              textShadow: "0 0 24px rgba(34,211,238,0.25)",
            }}
          >
            {GLASSBOX_COPY.fracture}
          </div>
        </MaskReveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
