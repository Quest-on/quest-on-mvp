import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2, OrganicCrack } from "../components";

// Cut 9 — 2.5s. Crack covers ~60% of front face. Light leak dominant.
// Glimpse of inner curves through cracks. Static. 75 frames.
export function Cut09(): ReactElement {
  const frame = useCurrentFrame();

  // Continued crack progress (carry over from Cut 8 — same component, later frames)
  // We start the crack at frame -40 to look already-grown.
  const leakOp = interpolate(frame, [0, 50], [0.4, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const tint = interpolate(frame, [0, 60], [0.18, 0.32], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Inner curves shadow — bezier hint just behind cracks
  const innerOp = interpolate(frame, [10, 60], [0, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #051120 0%, #000 78%)",
      }}
    >
      <BoxV2 size={480} yawDeg={-22} pitchDeg={18} energy={0.12} />

      {/* Continuing crack — starts pre-cut so it looks fully grown */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 480,
          height: 480,
          marginLeft: -240,
          marginTop: -240,
          transform: "translateZ(240px) rotateY(-22deg) rotateX(18deg)",
        }}
      >
        <OrganicCrack startFrame={-40} width={480} height={480} pulseAt={50} />
      </div>

      {/* Cyan tint across whole frame */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, rgba(34,211,238,${tint}), transparent 70%)`,
          opacity: leakOp,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* Hint of inner thought curves seeping through cracks */}
      <svg
        width={480}
        height={480}
        viewBox="0 0 480 480"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          marginLeft: -240,
          marginTop: -240,
          opacity: innerOp,
          mixBlendMode: "screen",
        }}
      >
        <path
          d="M 80 200 C 160 100, 320 300, 420 220"
          stroke="rgba(52,211,153,0.6)"
          strokeWidth={1}
          fill="none"
        />
        <path
          d="M 60 320 C 200 240, 280 360, 420 300"
          stroke="rgba(34,211,238,0.55)"
          strokeWidth={1}
          fill="none"
        />
      </svg>
    </AbsoluteFill>
  );
}
