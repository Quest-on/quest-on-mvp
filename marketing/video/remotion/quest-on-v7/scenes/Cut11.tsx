import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import {
  StudentExamMock,
  ThreeCube,
  WordReveal,
} from "../components";
import { COPY } from "../data";
import { QUESTON_BRAND } from "../brand";

// Cut 11 — 2.5s. SSE-driven StudentExamMock on glass cube's front face.
// v7 ★: streaming chat (typing dots → typewriter LLM reply) renders within the
// cube. Mock background tinted #F8FAFB + inner border + subtle inset pad
// prevents the white-out at the cube/mock boundary that v6 had.
//
// version-a-iter2 — UI hero rework (rubric Fix 3, +D axis):
//   • mock scale 0.34 → 0.85 so the SaaS UI fills the cube front face and
//     reads as a real product, not a thumbnail.
//   • multiply vignette + cool-wash gradient overlays REMOVED (they were
//     dimming the mock to the point of unreadability per VC rubric).
//   • frontFace background gradient alphas dropped 0.42/0.38 → 0.25/0.20
//     (near-glass) so cube glass structure still bleeds through but the
//     UI is the dominant read.
//   • push-out punch in the back half (frame 50–75): the cube scales
//     1.0 → 1.18 in the first half, then 1.18 → 1.32 in the back half so
//     the mock effectively pushes into camera as the cut hands off to
//     Cut 12's instructor-grading hero.
// Push-in + yaw lock-in over the FULL cut so motion never stalls. 75 frames.
export function Cut11(): ReactElement {
  const frame = useCurrentFrame();

  const pushIn = interpolate(
    frame,
    [0, 75],
    [1.0, 1.30],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );
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
  // iter5 D-axis — breakout: cube dissolves, product UI fills the screen.
  const breakout = interpolate(frame, [50, 68], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });
  const breakoutScale = interpolate(frame, [50, 75], [0.52, 0.96], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
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
          transform: `scale(${pushIn})`,
          opacity: 1 - breakout,
        }}
      >
        <ThreeCube
          size={1020}
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
                display: "grid",
                placeItems: "center",
              }}
            >
              <div
                style={{
                  width: 1920,
                  height: 1080,
                  transform: "scale(0.531)",
                  transformOrigin: "center center",
                  borderRadius: 16,
                  overflow: "hidden",
                  boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
                }}
              >
                <StudentExamMock compact streaming startFrame={-200} />
              </div>
            </div>
          }
        />
      </div>

      {/* iter5 D-axis — freestanding mock that grows out of the cube. Crossfades
          with the cube layer above for a clean "product escapes the metaphor"
          transition into Cut12. */}
      {breakout > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            opacity: breakout,
          }}
        >
          <div
            style={{
              position: "relative",
              width: 1920,
              height: 1080,
              transform: `scale(${breakoutScale})`,
              transformOrigin: "center",
              borderRadius: 22,
              overflow: "hidden",
              background: "#FAFAFA",
              boxShadow:
                "0 60px 120px -20px rgba(53,89,196,0.35), 0 30px 80px -20px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.06)",
            }}
          >
            <StudentExamMock compact streaming startFrame={-200} />
          </div>
        </div>
      ) : null}

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
        gradient
        gradientColors={[QUESTON_BRAND.primaryLight, QUESTON_BRAND.primary]}
      />
    </AbsoluteFill>
  );
}
