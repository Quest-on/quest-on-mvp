import type { ReactElement, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../constants";

export interface CloseUpProps {
  children: ReactNode;
  startFrame: number;
  durationFrames?: number;
  cropX?: number; // transform-origin X in %
  cropY?: number; // transform-origin Y in %
  cropW?: number; // unused but reserved for future framing logic
  cropH?: number;
  fromScale?: number;
  toScale?: number;
  blur?: number;
}

export function CloseUp({
  children,
  startFrame,
  durationFrames = 30,
  cropX = 50,
  cropY = 50,
  fromScale = 1.0,
  toScale = 1.4,
  blur = 6,
}: CloseUpProps): ReactElement {
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
  // Vignette dims & blurs the periphery so the focal area pops without literal cropping.
  const vignetteOpacity = progress * 0.55;
  const vignetteBlur = progress * blur;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale})`,
          transformOrigin: `${cropX}% ${cropY}%`,
          willChange: "transform",
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(circle at ${cropX}% ${cropY}%, transparent 28%, rgba(6,17,31,${vignetteOpacity}) 72%)`,
          backdropFilter: `blur(${vignetteBlur}px)`,
          WebkitBackdropFilter: `blur(${vignetteBlur}px)`,
        }}
      />
    </div>
  );
}
