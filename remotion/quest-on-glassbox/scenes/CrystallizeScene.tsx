import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, EASING, TYPO } from "../../quest-on-demo/constants";
import {
  GradientMesh,
  GodRay,
  PerspectiveStage,
} from "../../quest-on-demo/components";
import {
  FractureSurface,
  GlassBox,
  KineticType,
  ThoughtParticles,
} from "../components";
import { GLASSBOX_COPY } from "../data";

// Scene 3 — Crystallize. 540f / 18s @ 30fps. The hero scene.
// Camera: 0–6s dutch 35° -> 6–12s dutch 0° + push Z 1.0 -> 1.18 -> 12–18s hold.
// Copy: "사고는," at 4.5s (135f), "보이게." at 11.4s (342f).
const LINE1_START = 135;
const LINE2_START = 342;

export function CrystallizeScene(): ReactElement {
  const frame = useCurrentFrame();

  // Camera dutch (rotateZ) 35° -> 0° between 0 and 360f (12s).
  const dutch = interpolate(frame, [0, 180, 360], [35, 15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  // Push-in scale 1.0 -> 1.18 between 180 and 360f.
  const pushScale = interpolate(frame, [180, 360], [1.0, 1.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  // Crystallisation progress: 0 at 0f, 0.05 at 54f, full 1 at 405f (75%).
  const glassProgress = interpolate(frame, [0, 54, 405], [0, 0.05, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Cracks live for the first 30% of the scene as a transition layer.
  const crackOpacity = interpolate(frame, [0, 60, 240], [1, 1, 0], {
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
      {/* Background mesh — slowly grows from 8% to 18% */}
      <AbsoluteFill
        style={{
          opacity: interpolate(frame, [0, 540], [0.08, 0.18], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <GradientMesh tone="cool" intensity={1} />
      </AbsoluteFill>

      {/* Single GodRay — top-left, intensity 0.4 */}
      <GodRay
        startFrame={30}
        durationFrames={420}
        angle={-22}
        intensity={0.4}
        color="rgba(110,231,183,0.3)"
      />

      <PerspectiveStage perspective={1400}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${pushScale}) rotate(${dutch}deg)`,
            transformOrigin: "50% 55%",
            transformStyle: "preserve-3d",
          }}
        >
          {/* Crack layer fading out as glass grows */}
          <div style={{ opacity: crackOpacity, position: "absolute", inset: 0 }}>
            <FractureSurface startFrame={0} forceComplete />
          </div>

          {/* The crystallising glass box, with thought particles inside */}
          <GlassBox startFrame={0} progress={glassProgress}>
            <ThoughtParticles startFrame={60} />
          </GlassBox>
        </div>
      </PerspectiveStage>

      {/* Copy — line 1 ("사고는,") top-right offset, line 2 ("보이게.") below */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          gap: 18,
        }}
      >
        <div
          style={{
            fontSize: 84,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: COLORS.ink,
            lineHeight: TYPO.lineHeightTitle,
            transform: "translateX(360px) translateY(-160px)",
            filter: "hue-rotate(2deg)",
          }}
        >
          <KineticType
            text={GLASSBOX_COPY.crystallize.line1}
            startFrame={LINE1_START}
            staggerSeconds={0.06}
            perCharFrames={14}
            yOffset={10}
          />
        </div>
        <div
          style={{
            fontSize: 84,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: TYPO.lineHeightTitle,
            transform: "translateX(360px) translateY(-100px)",
            filter: "drop-shadow(0 0 18px rgba(34,211,238,0.35))",
          }}
        >
          <KineticType
            text={GLASSBOX_COPY.crystallize.line2}
            startFrame={LINE2_START}
            staggerSeconds={0.06}
            perCharFrames={14}
            yOffset={10}
            charStyle={{
              backgroundImage: COLORS.gradientPrimary,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
