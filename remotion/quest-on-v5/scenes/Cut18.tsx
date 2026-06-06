import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING, COLORS, TYPO } from "../../quest-on-demo/constants";
import { COPY } from "../data";
import { QUESTON_BRAND } from "../brand";

// Cut 18 — 4.0s. Wordmark "Quest-On" lock-in + sub-copy ladder rise.
// Each character of the wordmark eases in with stagger; sub-copy slides up.
// 120 frames. Motion runs every frame.
export function Cut18(): ReactElement {
  const frame = useCurrentFrame();

  const chars = "Quest-On".split("");
  const subCopy = COPY.cut18.words[0] ?? "";

  // Logo mark in upper-left — small accent glyph, breathes.
  const accentScale = 1 + 0.04 * Math.sin(frame * 0.08);
  const accentOpacity = interpolate(frame, [0, 16], [0, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subcopy ladder rise — runs ~36..96.
  const subRise = interpolate(frame, [36, 96], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  // Continuous letter-spacing breathe so type never freezes.
  const trackBreath = -0.04 + 0.005 * Math.sin(frame * 0.07);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* Cobalt diagonal sweep — slow, full-cut */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 70% 60% at ${50 + Math.sin(frame * 0.04) * 6}% 50%, ${QUESTON_BRAND.primaryLight}1F, transparent 70%)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* Tiny logo dot top-left — subtle brand presence */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 60,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: QUESTON_BRAND.brandGradient,
          boxShadow: `0 0 24px ${QUESTON_BRAND.primaryLight}`,
          opacity: accentOpacity,
          transform: `scale(${accentScale})`,
        }}
      />

      {/* Wordmark — character stagger */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "44%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          fontFamily: QUESTON_BRAND.fontFamily,
          fontSize: 140,
          fontWeight: 700,
          letterSpacing: `${trackBreath}em`,
          color: COLORS.ink,
          lineHeight: 1,
        }}
      >
        {chars.map((ch, i) => {
          const t = interpolate(
            frame,
            [i * 5, i * 5 + 18],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASING.cubicOut,
            },
          );
          return (
            <span
              key={`${ch}-${i}`}
              style={{
                display: "inline-block",
                opacity: t,
                transform: `translateY(${(1 - t) * 28}px) scale(${0.96 + t * 0.04})`,
                whiteSpace: "pre",
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>

      {/* Sub-copy ladder rise */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "calc(44% + 110px)",
          transform: `translate(-50%, ${(1 - subRise) * 18}px)`,
          fontFamily: QUESTON_BRAND.fontFamily,
          fontSize: COPY.cut18.fontSize,
          fontWeight: COPY.cut18.weight,
          letterSpacing: TYPO.letterSpacingBody,
          color: COLORS.muted,
          opacity: subRise,
          whiteSpace: "nowrap",
        }}
      >
        {subCopy}
      </div>
    </AbsoluteFill>
  );
}
