import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { InstructorGradeMock, OrganicCrack, ThreeCube } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 9 — 2.5s. Phase-transition: SEALED BLACKBOX → CRYSTAL GLASSBOX.
//
// Storyboard rewrite (v7 iter 13):
//   1) f0–f15  : opaque sealed cube (carry-over from Cut 8) with hairline cracks.
//   2) f15–f40 : cracks WIDEN, hidden contents (score, rubric, reasoning text)
//                start bleeding out through the openings — light beams escape.
//   3) f40–f60 : surface dissolves; the cube morphs to a transparent crystal
//                that LETS YOU SEE THE CONTENT INSIDE.
//   4) f60–f75 : crystal cube settles, contents fully legible — glassbox state.
//
// The point of this beat is to make literal the thesis of the whole video:
// "what was hidden behind a black box is now visible." 75 frames.
export function Cut09(): ReactElement {
  const frame = useCurrentFrame();

  // Phase progression 0→1.
  const wipe = interpolate(frame, [4, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });

  // Black surface opacity: holds at 1 then fades to 0 (faces dissolve).
  const blackOpacity = interpolate(frame, [12, 50], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Inner content reveal — text starts leaking, then becomes fully readable.
  const contentReveal = interpolate(frame, [10, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });

  const energy = interpolate(frame, [0, 75], [0.05, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  const SIZE = 920;
  const HALF = SIZE / 2;
  // Same orientation as Cut 8 so the morph reads as same object.
  const cubeTransform = `translateZ(${HALF + 1}px) rotateY(-22deg) rotateX(18deg)`;
  const innerTransform = `translateZ(${HALF}px) rotateY(-22deg) rotateX(18deg)`;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #051120 0%, #000 78%)",
      }}
    >
      {/* Underlying glass cube — this is what becomes visible as the black
          surface dissolves. iter 21 fix: transmission stays ON across the
          whole cut (always-glass) and a thickness ramp drives the
          opaque-thick → transparent-thin reveal. This makes the start frame
          read as glass (not a darker graphite tile) which closes the regression
          flagged by the critic. */}
      <ThreeCube
        size={SIZE}
        yawDeg={-22}
        pitchDeg={18}
        energy={energy}
        crystallise={wipe}
        surface={wipe > 0.55 ? "glass" : "graphite"}
        transmission={1}
        thickness={2.5 - wipe * 2}
        bloom={wipe > 0.4 && wipe < 0.85 ? 0.6 : 0}
      />

      {/* INNER CONTENT — InstructorGradeMock preview inside the opening cube.
          iter5 D-axis — shows real product UI inside the blackbox reveal so VCs
          see what the product IS as early as Cut09 (~19s). */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: SIZE,
          height: SIZE,
          marginLeft: -SIZE / 2,
          marginTop: -SIZE / 2,
          transform: innerTransform,
          overflow: "hidden",
          borderRadius: 12,
          opacity: contentReveal,
          pointerEvents: "none",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            width: 1920,
            height: 1080,
            transform: `scale(${SIZE / 1920})`,
            transformOrigin: "center center",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
          }}
        >
          <InstructorGradeMock streaming startFrame={-50} />
        </div>
      </div>

      {/* Black sealing layer over the front face — this is what dissolves to
          reveal contents. The mask is applied to this whole layer so the
          black erases top→bottom, exposing the inner content layer below. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: SIZE,
          height: SIZE,
          marginLeft: -HALF,
          marginTop: -HALF,
          transform: cubeTransform,
          borderRadius: 14,
          overflow: "hidden",
          opacity: blackOpacity,
          pointerEvents: "none",
          // The mask shows the black layer where it is opaque (top), and
          // erases it (bottom) where the wipe has passed. As `wipe` grows
          // 0→1, the erased area moves top→bottom — the seal melts off.
          WebkitMaskImage: `linear-gradient(180deg, rgba(0,0,0,1) ${
            Math.max(0, wipe * 100 - 14)
          }%, rgba(0,0,0,0) ${Math.min(100, wipe * 100 + 4)}%)`,
          maskImage: `linear-gradient(180deg, rgba(0,0,0,1) ${
            Math.max(0, wipe * 100 - 14)
          }%, rgba(0,0,0,0) ${Math.min(100, wipe * 100 + 4)}%)`,
        }}
      >
        {/* Solid opaque black mirrors OPAQUE_BLACK_FILL in BoxV4 so Cut 8→9
            reads as the same monolith with its skin dissolving away. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 30% 26%, #07090F 0%, #05060B 55%, #01020A 100%)",
            boxShadow:
              "inset 0 0 0 1px rgba(120,140,180,0.10), inset 0 0 80px rgba(0,0,0,0.95)",
          }}
        />
      </div>

      {/* Glow seam — the line where the black surface is currently dissolving.
          Two layers: inner crisp seam (sharp horizon line) + outer photon plume
          (soft wide glow). */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: SIZE,
          height: SIZE,
          marginLeft: -HALF,
          marginTop: -HALF,
          transform: cubeTransform,
          pointerEvents: "none",
          overflow: "hidden",
          borderRadius: 14,
        }}
      >
        {/* Inner crisp seam — sharp horizon line */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${wipe * 100 - 4}%`,
            height: "5%",
            background: `linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.9) 35%, ${QUESTON_BRAND.primaryLight} 50%, rgba(255,255,255,0.9) 65%, transparent 100%)`,
            filter: "blur(3px)",
            opacity:
              0.98 *
              (1 - Math.abs(wipe - 0.5) * 1.3) *
              (blackOpacity * 0.6 + 0.4),
            mixBlendMode: "screen",
          }}
        />
        {/* Outer photon plume — soft wide glow */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${wipe * 100 - 10}%`,
            height: "16%",
            background: `linear-gradient(180deg, transparent 0%, ${QUESTON_BRAND.primaryLight}cc 50%, transparent 100%)`,
            filter: "blur(14px)",
            opacity:
              0.85 *
              (1 - Math.abs(wipe - 0.5) * 1.4) *
              (blackOpacity * 0.6 + 0.4),
            mixBlendMode: "screen",
          }}
        />
      </div>

      {/* Cracks — visible early, fade as surface dissolves (tied to blackOpacity). */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: SIZE,
          height: SIZE,
          marginLeft: -HALF,
          marginTop: -HALF,
          transform: cubeTransform,
          opacity: blackOpacity,
          pointerEvents: "none",
        }}
      >
        <OrganicCrack startFrame={-40} width={SIZE} height={SIZE} pulseAt={20} />
      </div>
    </AbsoluteFill>
  );
}
