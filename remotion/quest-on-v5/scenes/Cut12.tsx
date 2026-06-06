import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { RealUIScreen } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 12 — 3.5s. Real instructor-grade dashboard takeover.
// 105 frames. Stall fix: continuous slow scale + cobalt-tint shimmer across whole cut.
export function Cut12(): ReactElement {
  const frame = useCurrentFrame();

  // Scale push-in is 3-step interpolate so motion runs full duration.
  const surfaceScale = interpolate(frame, [0, 30, 105], [1.18, 1.02, 0.98], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  // Slow Y drift simulates a "scrolling read".
  const yScroll = interpolate(frame, [0, 105], [0, -36], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const cobaltGlow = interpolate(frame, [0, 18], [0.45, 0.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cubeResidue = interpolate(frame, [0, 22], [0.7, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Spotlight sweep across UI — keeps the second half visually alive.
  const spotX = interpolate(frame, [40, 105], [10, 90], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const spotOpacity = interpolate(
    frame,
    [40, 60, 95, 105],
    [0, 0.55, 0.55, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ background: "#0F172A" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "60px 120px",
          transform: `scale(${surfaceScale})`,
          transformOrigin: "center",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 22,
            overflow: "hidden",
            boxShadow:
              "0 60px 120px -20px rgba(53,89,196,0.35), 0 30px 80px -20px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `translateY(${yScroll}px)`,
            }}
          >
            <RealUIScreen screen="instructor-grade" fit="cover" bare />
          </div>

          {/* Spotlight sweep — secondary motion */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse 30% 70% at ${spotX}% 50%, ${QUESTON_BRAND.primaryLight}33, transparent 70%)`,
              opacity: spotOpacity,
              mixBlendMode: "screen",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 80% 70% at 50% 50%, ${QUESTON_BRAND.primaryLight}, transparent 72%)`,
          opacity: cobaltGlow,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 620,
          height: 620,
          marginLeft: -310,
          marginTop: -310,
          borderRadius: 14,
          background: QUESTON_BRAND.brandGradientSoft,
          opacity: cubeResidue,
          mixBlendMode: "screen",
          filter: "blur(14px)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
}
