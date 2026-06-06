import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { CATEGORY_CAPTION } from "../data";
import { QUESTON_BRAND } from "../brand";

export interface CategoryCaptionProps {
  // Cut-local frame at which the chip starts to fade in.
  startFrame: number;
  // Total visible duration in frames (fade-in + hold + fade-out).
  durationFrames: number;
  // Fade-in / fade-out length in frames.
  fadeFrames?: number;
  // Optional override placement. Defaults to top-center, anchored ~64px from
  // the top of the frame so it doesn't compete with the cube hero.
  position?: "top-center" | "top-left";
}

// VC-pitch category caption (P0-1). Shown across Cut 1 / 2 / start of Cut 3
// so the first 5 seconds always carry "AI 시대의 사고력 평가 / Assess
// thinking, not answers." — the explicit category signal that the hook
// motif (cobalt point → wireframe → student) doesn't deliver alone.
export function CategoryCaption({
  startFrame,
  durationFrames,
  fadeFrames = 12,
  position = "top-center",
}: CategoryCaptionProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Guard against zero-fade calls — interpolate requires strictly increasing
  // input ranges. Caller passing fadeFrames=0 means "instant on/off".
  const safeFadeIn = Math.max(1, fadeFrames);
  const fadeIn =
    fadeFrames === 0
      ? local >= 0
        ? 1
        : 0
      : interpolate(local, [0, safeFadeIn], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASING.cubicOut,
        });
  const fadeOut =
    fadeFrames === 0
      ? local <= durationFrames
        ? 1
        : 0
      : interpolate(
          local,
          [durationFrames - safeFadeIn, durationFrames],
          [1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.cubicOut,
          },
        );
  const settle = interpolate(local, [0, safeFadeIn + 6], [-8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  const opacity = Math.min(fadeIn, fadeOut);
  if (opacity <= 0) {
    return <span style={{ display: "none" }} />;
  }

  const place =
    position === "top-left"
      ? ({ left: 80, top: 64 } as const)
      : ({ left: "50%", top: 64 } as const);
  const baseTransform =
    position === "top-left"
      ? `translateY(${settle}px)`
      : `translate(-50%, ${settle}px)`;

  return (
    <div
      style={{
        position: "absolute",
        ...place,
        transform: baseTransform,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: position === "top-left" ? "flex-start" : "center",
        gap: 6,
        zIndex: 65,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 22px",
          borderRadius: 999,
          background: "rgba(8, 14, 24, 0.62)",
          backdropFilter: "blur(10px)",
          boxShadow: `inset 0 0 0 1px ${QUESTON_BRAND.primaryLight}33, 0 8px 32px rgba(53,89,196,0.25)`,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: QUESTON_BRAND.primaryLight,
            boxShadow: `0 0 10px ${QUESTON_BRAND.primaryLight}, 0 0 24px ${QUESTON_BRAND.primary}`,
          }}
        />
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 3,
          }}
        >
          <span
            style={{
              fontFamily: QUESTON_BRAND.fontFamily,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              color: "rgba(255,255,255,0.96)",
            }}
          >
            {CATEGORY_CAPTION.ko}
          </span>
          <span
            style={{
              fontFamily: QUESTON_BRAND.fontFamily,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: QUESTON_BRAND.primaryLight,
              opacity: 0.7,
            }}
          >
            {CATEGORY_CAPTION.sub}
          </span>
        </span>
      </div>
    </div>
  );
}
