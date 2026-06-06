import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { COPY } from "../data";
import { QUESTON_BRAND } from "../brand";

// Cut 20 — 3.0s. Kinetic copy — "결과보다 사고 과정." 90 frames.
// Word-stagger + scale-punch on key word + gradient text. Background sweeps.
export function Cut20(): ReactElement {
  const frame = useCurrentFrame();
  const words = COPY.cut20.words;

  // Background diagonal sweep moves continuously across the cut.
  const sweepX = interpolate(frame, [0, 90], [-30, 130], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Camera dolly — slight zoom-out reveals copy.
  const dolly = interpolate(frame, [0, 90], [1.06, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse 80% 70% at 50% 50%, #061226 0%, #000 75%)",
      }}
    >
      {/* Diagonal cobalt sweep — never stops */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(115deg, transparent 0%, transparent ${sweepX - 20}%, ${QUESTON_BRAND.primaryLight}1F ${sweepX}%, transparent ${sweepX + 20}%, transparent 100%)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${dolly})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "baseline",
            gap: "0.32em",
            maxWidth: "82%",
          }}
        >
          {words.map((w, i) => {
            const enter = interpolate(
              frame,
              [i * 8, i * 8 + 18],
              [0, 1],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASING.expoOut,
              },
            );
            // Punch — scale dips just after enter, settles at 1.
            const punchPhase = interpolate(
              frame,
              [i * 8 + 12, i * 8 + 22, i * 8 + 36],
              [1.18, 1.04, 1.0],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASING.cubicOut,
              },
            );
            // Final word ("사고 과정.") gets accent gradient; others stay white.
            const isAccent = i >= 1;
            return (
              <span
                key={`${w}-${i}`}
                style={{
                  display: "inline-block",
                  fontFamily: QUESTON_BRAND.fontFamily,
                  fontSize: COPY.cut20.fontSize,
                  fontWeight: COPY.cut20.weight,
                  letterSpacing: "-0.035em",
                  lineHeight: 1.05,
                  opacity: enter,
                  transform: `translateY(${(1 - enter) * 28}px) scale(${enter * punchPhase})`,
                  color: isAccent ? "transparent" : QUESTON_BRAND.inkInverse,
                  backgroundImage: isAccent
                    ? QUESTON_BRAND.brandGradient
                    : undefined,
                  WebkitBackgroundClip: isAccent ? "text" : undefined,
                  backgroundClip: isAccent ? "text" : undefined,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
