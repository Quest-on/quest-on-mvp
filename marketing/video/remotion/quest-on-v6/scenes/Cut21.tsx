import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING, COLORS } from "../../quest-on-demo/constants";
import { COPY } from "../data";
import { QUESTON_BRAND } from "../brand";

// Cut 21 — 2.0s. Outro fade. Wordmark + url breathing 1.0 -> 0.96. 60 frames.
// Constant breath via sine; final 18f fade-to-black.
export function Cut21(): ReactElement {
  const frame = useCurrentFrame();

  // Wordmark scale — never stalls. Gentle 1.0 -> 0.96 settle plus sin breath.
  const settle = interpolate(frame, [0, 40], [1.0, 0.96], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });
  const breath = settle + 0.008 * Math.sin(frame * 0.18);

  // URL slides up.
  const urlRise = interpolate(frame, [0, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  // Final 18f fade-to-black on whole frame.
  const fade = interpolate(frame, [42, 60], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Cobalt halo behind wordmark — pulses every frame.
  const haloPulse = 0.4 + 0.1 * Math.sin(frame * 0.16);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div style={{ position: "absolute", inset: 0, opacity: fade }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 800,
            height: 360,
            marginLeft: -400,
            marginTop: -180,
            borderRadius: "50%",
            background: `radial-gradient(ellipse at 50% 50%, ${QUESTON_BRAND.primaryLight}33, transparent 70%)`,
            opacity: haloPulse,
            filter: "blur(50px)",
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "44%",
            transform: `translate(-50%, -50%) scale(${breath})`,
            fontFamily: QUESTON_BRAND.fontFamily,
            fontSize: 140,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: COLORS.ink,
            lineHeight: 1,
          }}
        >
          Quest-On
        </div>

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "calc(44% + 110px)",
            transform: `translate(-50%, ${(1 - urlRise) * 12}px)`,
            fontFamily: QUESTON_BRAND.fontFamilyMono,
            fontSize: COPY.cut21.urlSize,
            fontWeight: 500,
            letterSpacing: "0.02em",
            color: QUESTON_BRAND.primaryLight,
            opacity: urlRise * 0.92,
            whiteSpace: "nowrap",
          }}
        >
          {COPY.cut21.url}
        </div>
      </div>
    </AbsoluteFill>
  );
}
