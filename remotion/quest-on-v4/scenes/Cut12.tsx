import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { ProductMockupSurface } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 12 — 3.5s. Full-screen instructor grade dashboard takeover. The cube's
// front face from Cut 11 expands to fill the frame — match-cut growth.
// Camera continues push-in 1.18 -> 1.04 (zoom-out into laptop frame feel).
// 105 frames. Cross-dissolve into Cut 13 (8f overlap).
export function Cut12(): ReactElement {
  const frame = useCurrentFrame();

  // Surface scales up from cube front face -> full screen, then settles slightly back.
  const surfaceScale = interpolate(frame, [0, 24, 105], [1.18, 1.0, 0.98], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const cobaltGlow = interpolate(frame, [0, 18], [0.45, 0.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Soft "leaving the cube" floor reflection — dies quickly.
  const cubeResidue = interpolate(frame, [0, 22], [0.7, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "#0F172A" }}>
      {/* Floating laptop-frame style padding around the UI */}
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
          <ProductMockupSurface startFrame={0} variant="instructor-grade" />
        </div>
      </div>

      {/* Residual cobalt glow — metaphor lingers as we enter UI */}
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

      {/* Front-face residue — shrinking glass tile that fades out as UI lands */}
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
