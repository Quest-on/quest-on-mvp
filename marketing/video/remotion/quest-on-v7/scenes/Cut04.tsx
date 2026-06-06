import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { TextStream, ThreeCube, WordReveal } from "../components";
import { COPY } from "../data";

// Cut 4 — 2.5s. Code stream + cube + "모두 AI를 씁니다." 75 frames.
// v6 ★: copy switches from "AI를 쓴다." to "모두 AI를 씁니다." (보편 + 존댓말).
export function Cut04(): ReactElement {
  const frame = useCurrentFrame();
  const pushIn = interpolate(frame, [0, 75], [1.1, 1.16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 60% 50%, #050b18 0%, #000 78%)",
      }}
    >
      <div
        style={{ position: "absolute", inset: 0, transform: `scale(${pushIn})` }}
      >
        <div
          style={{
            position: "absolute",
            left: 200,
            top: 280,
          }}
        >
          <TextStream startFrame={0} width={420} height={520} />
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateX(260px)`,
          }}
        >
          <ThreeCube
            size={440}
            yawDeg={-22}
            pitchDeg={18}
            energy={0.35}
          />
        </div>
      </div>

      {/* iter 17 story fix — backing scrim behind the words boosts contrast
          against the cube + code-stream so "모두 AI를 씁니다." reads cleanly. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 720,
          height: 220,
          marginLeft: -360,
          marginTop: -110,
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 50%, transparent 75%)",
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />

      <WordReveal
        words={COPY.cut4.words}
        startFrame={14}
        staggerFrames={5}
        wordDurationFrames={14}
        holdFrames={32}
        exitFrames={14}
        fontSize={COPY.cut4.fontSize}
        fontWeight={COPY.cut4.weight}
        color="#e8eef8"
      />
    </AbsoluteFill>
  );
}
