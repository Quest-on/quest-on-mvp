import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { MultiBoxGrid } from "../components";

// Cut 6 — 3.0s. Pull-out reveals 6 cubes (2x3) in grid. 90 frames.
export function Cut06(): ReactElement {
  const frame = useCurrentFrame();

  // Pull-out: scale 1.6 -> 1.0 over 0..60f.
  const dollyScale = interpolate(frame, [0, 60], [1.6, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const pan = interpolate(frame, [0, 90], [0, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

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
            transform: "translate(-50%, -50%)",
          }}
        >
          <MultiBoxGrid
            startFrame={0}
            count={6}
            cols={3}
            size={240}
            width={1500}
            height={760}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
