import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4, TextStream, WordReveal } from "../components";
import { COPY } from "../data";

// Cut 4 — 2.5s. Code stream + cube + "모두 AI를 씁니다." 75 frames.
// v6 ★: copy switches from "AI를 쓴다." to "모두 AI를 씁니다." (보편 + 존댓말).
export function Cut04(): ReactElement {
  const frame = useCurrentFrame();
  const parallax = Math.sin(frame * 0.025) * 6;
  const streamPull = interpolate(frame, [10, 70], [0, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const pushIn = interpolate(frame, [0, 75], [1.1, 1.16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const yawDrift = interpolate(frame, [0, 75], [-22, -16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const energyBeat = 0.18 + Math.abs(Math.sin(frame * 0.06)) * 0.12;

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
            transform: `translate(${parallax}px, 0px) skewY(${streamPull * 0.06}deg)`,
          }}
        >
          <TextStream startFrame={0} width={420} height={520} />
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateX(${260 - parallax * 0.3}px)`,
          }}
        >
          <BoxV4
            size={440}
            yawDeg={yawDrift}
            pitchDeg={18}
            energy={energyBeat}
          />
        </div>
      </div>

      <WordReveal
        words={COPY.cut4.words}
        startFrame={14}
        staggerFrames={5}
        wordDurationFrames={14}
        holdFrames={32}
        exitFrames={14}
        fontSize={COPY.cut4.fontSize}
        fontWeight={COPY.cut4.weight}
        color="#b6c5d6"
      />
    </AbsoluteFill>
  );
}
