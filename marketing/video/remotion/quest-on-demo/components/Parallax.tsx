import type { ReactElement, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../constants";

export interface ParallaxProps {
  children: ReactNode;
  startFrame?: number;
  durationFrames?: number;
  fromScale?: number;
  toScale?: number;
  translateY?: number;
}

export function Parallax({
  children,
  startFrame = 0,
  durationFrames = 180,
  fromScale = 1.0,
  toScale = 1.06,
  translateY = 0,
}: ParallaxProps): ReactElement {
  const frame = useCurrentFrame();
  const progress = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );
  const scale = fromScale + (toScale - fromScale) * progress;
  const ty = translateY * progress;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `translate3d(0, ${ty}px, 0) scale(${scale})`,
        transformOrigin: "center center",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}
