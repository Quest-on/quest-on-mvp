import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import {
  BoxV4,
  StudentExamMock,
  ThoughtTrajectory,
  WordReveal,
} from "../components";
import { COPY } from "../data";
import { QUESTON_BRAND } from "../brand";

// Cut 11 — 2.5s. Inline StudentExamMock on glass cube's front face.
// v6 ★: PNG screenshot replaced with inline JSX mock — no cropping/sizing issues.
// Push-in + yaw lock-in over the FULL cut so motion never stalls. 75 frames.
export function Cut11(): ReactElement {
  const frame = useCurrentFrame();

  const pushIn = interpolate(frame, [0, 75], [1.0, 1.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const yaw = interpolate(frame, [0, 75], [-18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const pitch = interpolate(frame, [0, 75], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const traj = interpolate(frame, [0, 36], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const uiYShift = Math.sin(frame * 0.04) * 1.5;

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
            <div
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                transform: `translateY(${uiYShift}px)`,
                background: "#FAFAFA",
                display: "grid",
                placeItems: "center",
              }}
            >
              {/* StudentExamMock is 1920×1080 — scale to fit the cube face square. */}
              <div
                style={{
                  width: 1920,
                  height: 1080,
                  transform: "scale(0.34)",
                  transformOrigin: "center",
                }}
              >
                <StudentExamMock compact />
              </div>
            </div>
          }
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
            transform: `translateZ(310px) rotateY(${yaw}deg) rotateX(${pitch}deg)`,
            opacity: traj * 0.6,
            pointerEvents: "none",
            mixBlendMode: "screen",
          }}
        >
          <ThoughtTrajectory
            startFrame={0}
            width={620}
            height={620}
            count={9}
            withFragments={false}
          />
        </div>
      </div>

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
