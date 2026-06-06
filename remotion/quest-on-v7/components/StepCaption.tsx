import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";

export type StepCaptionPosition = "bottom-center" | "top-center";

export interface StepCaptionProps {
  // Optional zero-padded step number rendered in a small monospace pill
  // ("01" / "02" / "03"). When omitted only the label renders.
  step?: number;
  // Korean caption text. Kept short — single sentence/clause.
  label: string;
  // Optional English subtitle rendered below the Korean label, inside the
  // same pill. Italic, slightly smaller/dimmer. When absent nothing changes.
  labelEn?: string;
  // Cut-local frame at which fade-in begins.
  startFrame: number;
  // How long the caption stays on (fade-in + hold + fade-out total).
  durationFrames: number;
  // Vertical placement. Default bottom-center sits at y≈92% of frame.
  position?: StepCaptionPosition;
  // Fade duration in frames (in & out symmetric).
  fadeFrames?: number;
}

// Minimal subtitle chip used for VC-pitch step legibility (Phase 4 / Fix 5).
// Sits near the frame edge so it doesn't compete with hero motion. Cobalt
// accent dot + small step pill + Geist label, all at 14-16px / 500 weight,
// rgba(255,255,255,0.85). fade-in (8f) + slight horizontal slide; fade-out
// (8f). Designed to be safely overlaid on any cut without disturbing the
// underlying motion.
export function StepCaption({
  step,
  label,
  labelEn,
  startFrame,
  durationFrames,
  position = "bottom-center",
  fadeFrames = 8,
}: StepCaptionProps): ReactElement {
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
  // Subtle 12px → 0px left-slide on entry. Provides motion polish without
  // pulling attention from the hero subject.
  const slide = interpolate(local, [0, fadeFrames], [-12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  const opacity = Math.min(fadeIn, fadeOut);
  if (opacity <= 0) {
    return <span style={{ display: "none" }} />;
  }

  const place =
    position === "top-center"
      ? ({ top: 72 } as const)
      : ({ bottom: 72 } as const);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        ...place,
        transform: `translate(-50%, 0) translateX(${slide}px)`,
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 18px",
        borderRadius: 999,
        // Subtle dark glass so the caption reads on every cut
        // (light + dark backgrounds alike) without forcing a hard plate.
        background: "rgba(8, 14, 24, 0.55)",
        backdropFilter: "blur(8px)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
        zIndex: 60,
        pointerEvents: "none",
      }}
    >
      {/* Cobalt accent dot — brand cue. */}
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: QUESTON_BRAND.primaryLight,
          boxShadow: `0 0 8px ${QUESTON_BRAND.primaryLight}`,
        }}
      />
      {typeof step === "number" ? (
        <span
          style={{
            fontFamily: QUESTON_BRAND.fontFamilyMono,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: QUESTON_BRAND.primaryLight,
            opacity: 0.9,
            padding: "2px 8px",
            borderRadius: 6,
            background: "rgba(87,205,255,0.10)",
            boxShadow: "inset 0 0 0 1px rgba(87,205,255,0.25)",
          }}
        >
          {step.toString().padStart(2, "0")}
        </span>
      ) : null}
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontFamily: QUESTON_BRAND.fontFamily,
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: "0.005em",
            color: "rgba(255,255,255,0.88)",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        {labelEn ? (
          <span
            style={{
              fontFamily: QUESTON_BRAND.fontFamily,
              fontSize: 13,
              fontWeight: 400,
              fontStyle: "italic",
              letterSpacing: "0.01em",
              color: "rgba(255,255,255,0.55)",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
          >
            {labelEn}
          </span>
        ) : null}
      </span>
    </div>
  );
}
