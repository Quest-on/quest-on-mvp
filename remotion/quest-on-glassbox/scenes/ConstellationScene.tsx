import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, EASING, TYPO } from "../../quest-on-demo/constants";
import {
  GradientMesh,
  PerspectiveStage,
} from "../../quest-on-demo/components";
import { Constellation, WordmarkReveal } from "../components";
import { BLACKBOX_GEOMETRY } from "../components/BlackBox";
import { GLASSBOX_COPY } from "../data";

// Scene 4 — Constellation & Mark. 380f / 12.7s @ 30fps.
// 0%: 1f flash. 5%: stars appear. 25–60%: yaw rotate. 75%: wordmark draw.
// 88%: subline fade. 95%: stars fade out, wordmark + subline hold.
// The glass cube outline holds at low opacity throughout the scene to keep
// the metaphor "thought constellations inside the glass cube" intact, and
// only fades out in the final 2 seconds (last 60f) once the wordmark lands.
const FLASH_FRAME = 0;
const WORDMARK_START = 285; // 9.5s
const SUBLINE_START = 336; // 11.2s
const STAR_FADEOUT = 360; // 12s
const CUBE_FADEOUT_START = 340; // 11.3s — the last ~2s only.
const CUBE_FADEOUT_END = 372; // 12.4s
const CUBE_HOLD_OPACITY = 0.35; // faint stroke; stays inside metaphor without competing.

export function ConstellationScene(): ReactElement {
  const frame = useCurrentFrame();

  // White flash on the very first frame.
  const flashOpacity = interpolate(frame, [FLASH_FRAME, FLASH_FRAME + 1, FLASH_FRAME + 2], [1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Camera Z 1.18 -> 1.4 then settle.
  const camScale = interpolate(frame, [0, 90, 228], [1.18, 1.32, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  // Subline fade-in.
  const sublineOpacity = interpolate(
    frame,
    [SUBLINE_START, SUBLINE_START + 30],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  // Glass cube outline — holds at faint opacity, fades out in the last 2s.
  const cubeOpacity = interpolate(
    frame,
    [0, 24, CUBE_FADEOUT_START, CUBE_FADEOUT_END],
    [0, CUBE_HOLD_OPACITY, CUBE_HOLD_OPACITY, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
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
      {/* Cosmic mesh — 30% intensity */}
      <AbsoluteFill style={{ opacity: 0.28 }}>
        <GradientMesh tone="cool" intensity={1} />
      </AbsoluteFill>

      {/* Volumetric fog — soft blue-violet haze */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(34,211,238,0.10), transparent 70%)",
          filter: "blur(12px)",
          pointerEvents: "none",
        }}
      />

      <PerspectiveStage perspective={1600}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${camScale})`,
            transformStyle: "preserve-3d",
          }}
        >
          <CubeOutline opacity={cubeOpacity} />
          <Constellation
            startFrame={0}
            fadeOutStart={STAR_FADEOUT}
            fadeOutDuration={21}
          />
        </div>
      </PerspectiveStage>

      {/* Wordmark — centred */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          gap: 48,
        }}
      >
        <div style={{ width: "100%", maxWidth: 1200 }}>
          <WordmarkReveal
            text={GLASSBOX_COPY.constellation.wordmark}
            startFrame={WORDMARK_START}
            strokeDurationFrames={42}
            fillStartRatio={0.5}
            fontSize={140}
          />
        </div>
        <div
          style={{
            opacity: sublineOpacity,
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: COLORS.inkSoft,
            lineHeight: TYPO.lineHeightTitle,
            marginTop: -40,
            textShadow: "0 0 18px rgba(34,211,238,0.18)",
          }}
        >
          {GLASSBOX_COPY.constellation.subline}
        </div>
      </AbsoluteFill>

      {/* White flash */}
      <AbsoluteFill
        style={{
          background: "#ffffff",
          opacity: flashOpacity,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
}

// Local helper: faint isometric-cube stroke that frames the constellation so
// the "thought constellations inside the glass cube" metaphor doesn't break
// when the cube paint disappears between Crystallize and Constellation.
function CubeOutline({ opacity }: { opacity: number }): ReactElement {
  const { size: BOX, isoX: IX, isoY: IY } = BLACKBOX_GEOMETRY;
  const W = BOX + IX * 2;
  const H = BOX + IY * 2;
  const FRONT_X = IX;
  const FRONT_Y = IY * 2;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        pointerEvents: "none",
      }}
    >
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="cube-outline-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.9} />
          </linearGradient>
        </defs>
        {/* Top face outline */}
        <polygon
          points={`${IX},${IY * 2} ${IX + BOX},${IY * 2} ${IX + BOX - IX},${IY} ${0},${IY}`}
          fill="none"
          stroke="url(#cube-outline-grad)"
          strokeWidth={1.2}
        />
        {/* Left face outline */}
        <polygon
          points={`${IX},${IY * 2} ${IX},${IY * 2 + BOX} ${0},${IY + BOX} ${0},${IY}`}
          fill="none"
          stroke="url(#cube-outline-grad)"
          strokeWidth={1.2}
        />
        {/* Front face outline */}
        <rect
          x={FRONT_X}
          y={FRONT_Y}
          width={BOX}
          height={BOX}
          fill="none"
          stroke="url(#cube-outline-grad)"
          strokeWidth={1.2}
        />
      </svg>
    </div>
  );
}
