import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4 } from "../components/BoxV4";
import { ProductMockupSurface, WordReveal, ThoughtTrajectory } from "../components";
import { COPY } from "../data";
import { QUESTON_BRAND } from "../brand";

// Cut 11 — 2.5s. ★ Surface morph: glass cube's front face morphs into the actual
// Quest-On student exam UI (ProductMockupSurface). Other 5 faces stay glass —
// metaphor lingering. Push-in continues. "그래서…" centred.
// 75 frames.
export function Cut11(): ReactElement {
  const frame = useCurrentFrame();

  // Continue camera push-in from cut 10's glass into UI surface.
  const pushIn = interpolate(frame, [0, 75], [1.0, 1.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  // Yaw rotates so the front face turns toward the camera (becomes readable).
  const yaw = interpolate(frame, [0, 60], [-18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const pitch = interpolate(frame, [0, 60], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  // Trajectory curves fade out as UI takes over (they morph into the chat connectors).
  const traj = interpolate(frame, [0, 36], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // UI surface reveal — starts at frame 16 inside the box's front face.
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
          transform: `scale(${pushIn})`,
        }}
      >
        <BoxV4
          size={620}
          yawDeg={yaw}
          pitchDeg={pitch}
          surface="glass"
          crystallise={1}
          energy={0.55}
          frontFace={
            <ProductMockupSurface startFrame={-16} variant="student-exam" />
          }
        />

        {/* Thought trajectory still lives behind glass for the first 36 frames */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 620,
            height: 620,
            marginLeft: -310,
            marginTop: -310,
            transform: `translateZ(310px) rotateY(${yaw}deg) rotateX(${pitch}deg)`,
            opacity: traj * 0.6,
            pointerEvents: "none",
            mixBlendMode: "screen",
          }}
        >
          <ThoughtTrajectory startFrame={0} width={620} height={620} count={9} withFragments={false} />
        </div>
      </div>

      {/* Edge cobalt glow — metaphor residue */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 50% 40% at 50% 50%, ${QUESTON_BRAND.primaryLight}1A, transparent 70%)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      <WordReveal
        words={COPY.cut11.words}
        startFrame={28}
        staggerFrames={4}
        wordDurationFrames={16}
        holdFrames={20}
        exitFrames={10}
        fontSize={COPY.cut11.fontSize}
        fontWeight={COPY.cut11.weight}
        color="#dde6f3"
      />
    </AbsoluteFill>
  );
}
