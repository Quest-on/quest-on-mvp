import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { ThreeCube, WordReveal } from "../components";
import { COPY } from "../data";

// Cut 6 — 3.0s. Multi-cube grid pull-out. 90 frames.
export function Cut06(): ReactElement {
  const frame = useCurrentFrame();

  const dollyScale = interpolate(frame, [0, 60], [1.5, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  // iter 17 visual fix — sweeping spotlight pass across the cube grid so the
  // multi-cube shot reads as a lit display, not a flat dark grid. Slow drift
  // 18→82 from left to right; opacity peaks mid-cut.
  const sweepX = interpolate(frame, [18, 82], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });
  const sweepOp = interpolate(frame, [18, 35, 65, 82], [0, 0.6, 0.6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cells = [
    { yaw: -22, pitch: 18, phase: 0.0, label: "학생 1" },
    { yaw: -18, pitch: 14, phase: 0.7, label: "학생 2" },
    { yaw: -25, pitch: 20, phase: 1.4, label: "학생 3" },
    { yaw: -16, pitch: 16, phase: 2.1, label: "학생 4" },
    { yaw: -22, pitch: 18, phase: 2.8, label: "학생 5" },
    { yaw: -20, pitch: 14, phase: 3.5, label: "학생 6" },
  ];
  const cols = 3;
  const size = 240;
  const colGap = 80;
  const rowGap = 80;
  const stageW = cols * size + (cols + 1) * colGap;
  const stageH = 2 * size + 3 * rowGap;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 45%, #061328 0%, #010205 80%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${dollyScale})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: stageW,
            height: stageH,
            marginLeft: -stageW / 2,
            marginTop: -stageH / 2,
          }}
        >
          {cells.map((cell, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const x = colGap + c * (size + colGap);
            const y = rowGap + r * (size + rowGap);
            const appear = interpolate(
              frame,
              [i * 4, i * 4 + 18],
              [0, 1],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASING.smoothOut,
              },
            );
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x + size / 2,
                  top: y + size / 2,
                  width: size,
                  height: size,
                  opacity: appear,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <ThreeCube
                  size={size}
                  yawDeg={cell.yaw}
                  pitchDeg={cell.pitch}
                  energy={0.25}
                  scale={1}
                />
              </div>
            );
          })}
        </div>
      </div>

      <WordReveal
        words={COPY.cut6.words}
        startFrame={20}
        staggerFrames={5}
        wordDurationFrames={16}
        holdFrames={38}
        exitFrames={12}
        fontSize={COPY.cut6.fontSize}
        fontWeight={COPY.cut6.weight}
        color="#e8eef8"
      />

      {/* iter 17 visual fix — sweeping spotlight gives the dark grid life. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 28% 70% at ${sweepX}% 50%, rgba(99,179,237,0.22) 0%, rgba(53,89,196,0.12) 35%, transparent 70%)`,
          opacity: sweepOp,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
}
