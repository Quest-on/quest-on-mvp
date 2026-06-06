import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";

export type DomainLabelPosition =
  | "top-left"
  | "top-right"
  | "bottom-center"
  | "centered";

export interface DomainLabelProps {
  label: "학생" | "강사";
  position: DomainLabelPosition;
  // Frame (cut-local) at which to begin fade-in.
  startFrame: number;
  // How long the label stays visible.
  durationFrames: number;
  // Fade-in / fade-out length in frames.
  fadeFrames?: number;
}

// Small pill label that names the domain on screen ("학생" / "강사").
// Student = cobalt, instructor = purple-leaning gradient — distinct hue keeps
// the split between the two POVs unambiguous.
export function DomainLabel({
  label,
  position,
  startFrame,
  durationFrames,
  fadeFrames = 12,
}: DomainLabelProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  const fadeIn = interpolate(local, [0, fadeFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const fadeOut = interpolate(
    local,
    [durationFrames - fadeFrames, durationFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );
  const slide = interpolate(local, [0, fadeFrames], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  const opacity = Math.min(fadeIn, fadeOut);
  if (opacity <= 0) {
    return <span style={{ display: "none" }} />;
  }

  const isStudent = label === "학생";
  const background = isStudent
    ? `linear-gradient(135deg, ${QUESTON_BRAND.primaryLight} 0%, ${QUESTON_BRAND.primaryDeep} 100%)`
    : "linear-gradient(135deg, #C084FC 0%, #7C3AED 100%)";
  const shadowColor = isStudent
    ? "rgba(53,89,196,0.45)"
    : "rgba(124,58,237,0.45)";

  const place = (() => {
    switch (position) {
      case "top-left":
        return { left: 80, top: 80 } as const;
      case "top-right":
        return { right: 80, top: 80 } as const;
      case "bottom-center":
        return {
          left: "50%",
          bottom: 80,
          transform: `translate(-50%, ${slide}px)`,
        } as const;
      case "centered":
      default:
        return {
          left: "50%",
          top: "50%",
          transform: `translate(-50%, calc(-50% + ${slide}px))`,
        } as const;
    }
  })();

  const baseTransform =
    position === "bottom-center" || position === "centered"
      ? (place.transform ?? `translateY(${slide}px)`)
      : `translateY(${slide}px)`;

  return (
    <div
      style={{
        position: "absolute",
        ...place,
        transform: baseTransform,
        opacity,
        padding: "8px 18px",
        borderRadius: 999,
        background,
        color: "#fff",
        fontFamily: QUESTON_BRAND.fontFamily,
        fontSize: 18,
        fontWeight: 600,
        letterSpacing: "0.02em",
        boxShadow: `0 8px 24px ${shadowColor}, inset 0 0 0 1px rgba(255,255,255,0.15)`,
        backdropFilter: "blur(4px)",
        zIndex: 50,
      }}
    >
      {label}
    </div>
  );
}
