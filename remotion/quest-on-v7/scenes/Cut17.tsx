import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { LightParticles, QuestOnLogo } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 17 — 4.0s. Quest-On logo SVG reveal — stroke draw + gradient fill.
// Tightened from v4's 6s. Halo bloom + drifting particles run all 120 frames so the
// post-fill window is never dead.
//
// v7 + three.js iter — adds a native SVG bloom filter wrapper around the
// logo so the halo pulses with feGaussianBlur+feComposite, no chroma-
// subsampling artefacts. Frame-driven stdDeviation (4 → 12 → 4) and k3
// (0.0 → 0.7 → 0.3) give the logo a "lit-from-within" cobalt glow during
// the lock-in window without leaving the SVG renderer.
export function Cut17(): ReactElement {
  const frame = useCurrentFrame();

  // Halo fades in during draw.
  const halo = interpolate(frame, [0, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  // SVG-native bloom — stdDeviation 4 → 10 → 4 across the cut, with a peak
  // around the logo lock-in moment (frame ~70). Drives an feGaussianBlur+
  // feComposite filter wrapping the QuestOnLogo SVG so the cobalt outline +
  // gradient fill render with a soft photon halo.
  // iter 21 fix — peak capped at 10 (was 12) and k3 capped at 0.65 (was
  // 0.7) so the Q outline doesn't over-bloom into a soft mush at lock-in.
  const bloomStd = interpolate(
    frame,
    [0, 35, 70, 105, 120],
    [4, 8, 10, 8, 5],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );
  const bloomK3 = interpolate(
    frame,
    [0, 35, 70, 105, 120],
    [0, 0.45, 0.65, 0.5, 0.3],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <LightParticles
        startFrame={-50}
        count={28}
        mode="drift"
        width={1920}
        height={1080}
        color={QUESTON_BRAND.primaryLight}
      />

      {/* Static radial halo behind the logo. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 640,
          height: 640,
          marginLeft: -320,
          marginTop: -320,
          borderRadius: 640,
          background: `radial-gradient(circle, ${QUESTON_BRAND.primaryLight}44 0%, transparent 70%)`,
          filter: "blur(40px)",
          opacity: halo * 0.7,
          pointerEvents: "none",
        }}
      />

      {/* SVG bloom filter wrapper — feGaussianBlur + feComposite gives the
          logo a native, render-clean glow that doesn't suffer from
          chroma-subsampling like CSS blur on h264 output. */}
      <svg
        width="0"
        height="0"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <defs>
          <filter
            id="logoBloom"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation={bloomStd} result="blur" />
            <feComposite
              in="blur"
              in2="SourceGraphic"
              operator="arithmetic"
              k1={0}
              k2={1}
              k3={bloomK3}
              k4={0}
            />
          </filter>
        </defs>
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          filter: "url(#logoBloom)",
        }}
      >
        <QuestOnLogo
          size={240}
          startFrame={0}
          durationFrames={70}
          iconOnly
        />
      </div>
    </AbsoluteFill>
  );
}
