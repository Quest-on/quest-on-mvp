import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { CubeVariant, LightParticles } from "../components";
import { QUESTON_BRAND } from "../brand";

// Cut 2 — 2.0s. V1 wireframe crystallizes from particles. 60 frames.
export function Cut02(): ReactElement {
  const frame = useCurrentFrame();

  const wireProgress = interpolate(frame, [18, 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const pushIn = interpolate(frame, [0, 60], [1, 1.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #050a18 0%, #000 70%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${pushIn})`,
        }}
      >
        {frame < 32 ? (
          <LightParticles
            startFrame={0}
            count={28}
            mode="explode"
            durationFrames={32}
            color={QUESTON_BRAND.primaryLight}
          />
        ) : null}
        {frame >= 22 && frame < 58 ? (
          <LightParticles
            startFrame={22}
            count={28}
            mode="converge"
            durationFrames={32}
            color={QUESTON_BRAND.primaryLight}
          />
        ) : null}

        <CubeVariant
          kind="V1-wireframe"
          size={460}
          progress={wireProgress}
        />
      </div>
    </AbsoluteFill>
  );
}
