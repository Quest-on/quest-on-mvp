import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4 } from "../components";

// Cut 6 — 3.0s. Multi-cube grid pull-out. 90 frames.
export function Cut06(): ReactElement {
  const frame = useCurrentFrame();

  const dollyScale = interpolate(frame, [0, 60], [1.5, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const pan = interpolate(frame, [0, 90], [0, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  const cells = [
    { yaw: -22, pitch: 18, phase: 0.0 },
    { yaw: -18, pitch: 14, phase: 0.7 },
    { yaw: -25, pitch: 20, phase: 1.4 },
    { yaw: -16, pitch: 16, phase: 2.1 },
    { yaw: -22, pitch: 18, phase: 2.8 },
    { yaw: -20, pitch: 14, phase: 3.5 },
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
          "radial-gradient(circle at 50% 45%, #050b18 0%, #000 80%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${dollyScale}) translateX(${-pan * 0.6}%)`,
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
            const wobbleY = Math.sin(frame * 0.05 + cell.phase) * 2.4;
            const yaw = cell.yaw + Math.sin(frame * 0.04 + cell.phase) * 1.6;
            const pitch =
              cell.pitch + Math.cos(frame * 0.04 + cell.phase) * 1.0;
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
            const energy =
              0.18 + Math.abs(Math.sin(frame * 0.06 + cell.phase)) * 0.18;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x + size / 2,
                  top: y + size / 2 + wobbleY,
                  width: size,
                  height: size,
                  opacity: appear,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <BoxV4
                  size={size}
                  yawDeg={yaw}
                  pitchDeg={pitch}
                  energy={energy}
                  noise={false}
                  scale={0.95 + appear * 0.05}
                />
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
