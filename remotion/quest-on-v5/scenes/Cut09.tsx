import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4, OrganicCrack } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 9 — 2.5s. V5 phase-transition wipe (graphite -> glass). 75 frames.
export function Cut09(): ReactElement {
  const frame = useCurrentFrame();

  const wipe = interpolate(frame, [4, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });
  const energy = interpolate(frame, [0, 75], [0.12, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #051120 0%, #000 78%)",
      }}
    >
      <BoxV4
        size={480}
        yawDeg={-22}
        pitchDeg={18}
        energy={energy}
        crystallise={wipe}
        surface={wipe > 0.55 ? "glass" : "graphite"}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 480,
          height: 480,
          marginLeft: -240,
          marginTop: -240,
          transform: "translateZ(241px) rotateY(-22deg) rotateX(18deg)",
          pointerEvents: "none",
          overflow: "hidden",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${wipe * 100 - 6}%`,
            height: "12%",
            background: `linear-gradient(180deg, transparent 0%, ${QUESTON_BRAND.primaryLight} 50%, transparent 100%)`,
            filter: "blur(6px)",
            opacity: 0.85 * (1 - Math.abs(wipe - 0.5) * 1.4),
          }}
        />
      </div>

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
          opacity: 1 - wipe,
        }}
      >
        <OrganicCrack startFrame={-40} width={480} height={480} pulseAt={20} />
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${QUESTON_BRAND.primaryLight}28, transparent 70%)`,
          opacity: wipe * 0.55,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
}
