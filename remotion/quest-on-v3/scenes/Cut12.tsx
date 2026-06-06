import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV2, ThoughtTrajectory, LightParticles } from "../components";

// Cut 12 — 3.5s. Glass cube 70% with internal trajectory + fragments + particles.
// Dutch 25 -> 0 + push-in (Z 1.0 -> 1.18). 105 frames.
export function Cut12(): ReactElement {
  const frame = useCurrentFrame();

  const dutch = interpolate(frame, [0, 70], [25, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const pushIn = interpolate(frame, [0, 105], [1.0, 1.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #08182a 0%, #000 78%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `rotateZ(${dutch}deg) scale(${pushIn})`,
        }}
      >
        <BoxV2
          size={560}
          yawDeg={-18}
          pitchDeg={14}
          surface="glass"
          crystallise={1}
          energy={0.55}
        />

        {/* Internal trajectory — placed at front-face plane */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 560,
            height: 560,
            marginLeft: -280,
            marginTop: -280,
            transform: "translateZ(280px) rotateY(-18deg) rotateX(14deg)",
          }}
        >
          <ThoughtTrajectory
            startFrame={0}
            width={560}
            height={560}
            count={9}
            withFragments
          />
        </div>

        {/* Floating particles inside */}
        <LightParticles
          startFrame={0}
          count={28}
          mode="drift"
          width={1920}
          height={1080}
          color="rgba(52,211,153,0.65)"
        />
      </div>
    </AbsoluteFill>
  );
}
