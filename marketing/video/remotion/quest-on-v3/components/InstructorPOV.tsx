import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { HandSilhouette } from "./HandSilhouette";

export interface InstructorPOVProps {
  startFrame?: number;
  // Stage width/height for the dashboard grid backdrop.
  width?: number;
  height?: number;
}

const DASH_GRID =
  "linear-gradient(rgba(180,200,230,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(180,200,230,0.06) 1px, transparent 1px)";

export function InstructorPOV({
  startFrame = 0,
  width = 1920,
  height = 1080,
}: InstructorPOVProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Hand descends from top and casts shadow on the cube.
  const handY = interpolate(local, [0, 36], [-220, -40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const handOp = interpolate(local, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shadowAlpha = interpolate(local, [12, 36], [0, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        pointerEvents: "none",
      }}
    >
      {/* Dashboard grid backdrop — like a desk surface */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: DASH_GRID,
          backgroundSize: "48px 48px",
          opacity: 0.5,
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 60%, #000 0%, #000 50%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 60%, #000 0%, #000 50%, transparent 100%)",
        }}
      />

      {/* Cast shadow on cube area */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 560,
          height: 240,
          transform: "translate(-50%, 60%)",
          background: `radial-gradient(ellipse 70% 50% at 50% 30%, rgba(0,0,0,${shadowAlpha}) 0%, transparent 70%)`,
          filter: "blur(20px)",
        }}
      />

      {/* Hand silhouette descends from top */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          transform: `translate(-50%, ${handY}%)`,
          opacity: handOp,
        }}
      >
        <HandSilhouette
          width={680}
          height={460}
          withKeyboard={false}
          inverted
          opacity={0.9}
        />
      </div>
    </div>
  );
}
