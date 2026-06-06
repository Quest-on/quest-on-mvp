import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import {
  CubeVariant,
  HandSilhouette,
  ThreeCube,
} from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 3 — 2.5s. Wireframe -> graphite morph; hand from bottom; key pulse. 75f.
// v6 ★: 학생 라벨 fade-in + fade-out (Idea 1 from copy-honorific-and-domain.md).
export function Cut03(): ReactElement {
  const frame = useCurrentFrame();

  const wireOpacity = interpolate(frame, [0, 30], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const cubeReveal = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  // iter 22 — handY translates DOWN (positive values push hand toward
  // bottom of frame). Original 220 → 90 ended with fingertips ~30px
  // intruding into the cube bottom edge (revealed by the hard ThreeCube
  // projected edge). Lift the end target to 140 so fingertips read as
  // *touching* the bottom of the cube without overlapping it.
  const handY = interpolate(frame, [12, 48], [260, 140], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const cubeEnergy = interpolate(frame, [40, 65], [0.18, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #060d1c 0%, #000 78%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
        }}
      >
        <div style={{ opacity: wireOpacity }}>
          <CubeVariant kind="V1-wireframe" size={460} progress={1} />
        </div>
        <div style={{ opacity: cubeReveal }}>
          <ThreeCube size={460} yawDeg={-22} pitchDeg={18} energy={cubeEnergy} />
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 0,
            transform: `translate(-50%, ${handY}px)`,
            // iter 21 — explicit drop-shadow rim so the hand bottom-edge
            // glow survives even when the underlying ThreeCube no longer
            // bleeds soft cobalt onto the silhouette the way the CSS
            // BoxV4 used to.
            filter: `drop-shadow(0 4px 8px rgba(87,205,255,0.3))`,
          }}
        >
          <HandSilhouette
            width={620}
            height={420}
            withKeyboard
            opacity={0.94}
            rim={QUESTON_BRAND.primaryLight}
          />
        </div>
      </div>

    </AbsoluteFill>
  );
}
