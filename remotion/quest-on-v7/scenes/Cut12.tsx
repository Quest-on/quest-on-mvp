import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { InstructorGradeMock } from "../components";

// Cut 12 — 3.5s. AI-grading sequence inside InstructorGradeMock.
// v7 ★: AI 분석 중 → streaming summary → score count-up → rubric bar fill — all
// frame-driven. 105 frames. Continuous slow scale + cobalt-tint shimmer keep motion alive.
export function Cut12(): ReactElement {
  const frame = useCurrentFrame();

  const surfaceScale = interpolate(frame, [0, 30, 105], [1.18, 1.02, 0.98], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const yScroll = interpolate(frame, [0, 105], [0, -36], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill style={{ background: "#0F172A" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          // iter 19 story fix — tighter framing so the InstructorGradeMock
          // fills more of the frame and doesn't leave a dead white bottom
          // half during AI grading mid-stream.
          padding: "24px 48px",
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
            background: "#FAFAFA",
            boxShadow:
              "0 60px 120px -20px rgba(53,89,196,0.35), 0 30px 80px -20px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          {/* Inline mock — render at 1920×1080, scale to fit framed slot. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              transform: `translateY(${yScroll}px)`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: 1920,
                height: 1080,
                // iter 19 — slight up-scale (0.86 → 0.94) to push more content
                // into view with the new tighter frame.
                transform: "scale(1.0)",
                transformOrigin: "center",
              }}
            >
              <InstructorGradeMock streaming startFrame={-35} />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
