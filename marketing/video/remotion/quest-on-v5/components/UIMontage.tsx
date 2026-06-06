import type { CSSProperties, ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { RealUIScreen, type RealUIScreenName } from "./RealUIScreen";
import { QUESTON_BRAND } from "../brand";

export interface UIMontageProps {
  // Total duration of the montage.
  durationFrames: number;
  // Frame at which montage begins (relative to current sequence).
  startFrame?: number;
  // Screens to cycle through.
  screens?: readonly RealUIScreenName[];
  // Cross-fade overlap between screens.
  crossFadeFrames?: number;
  // Caption shown beneath each screen (matches index).
  captions?: readonly string[];
}

const DEFAULT_SCREENS: readonly RealUIScreenName[] = [
  "student-exam",
  "instructor-grade",
  "student-dashboard",
];

const DEFAULT_CAPTIONS: readonly string[] = [
  "학생 — AI와 함께 사고",
  "강사 — 사고 궤적 평가",
  "학생 — 진행 현황 대시보드",
];

export function UIMontage({
  durationFrames,
  startFrame = 0,
  screens = DEFAULT_SCREENS,
  crossFadeFrames = 12,
  captions = DEFAULT_CAPTIONS,
}: UIMontageProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const slotLen = durationFrames / screens.length;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse 80% 60% at 50% 50%, #061226 0%, #02060f 70%, #000 100%)",
      }}
    >
      {screens.map((screen, i) => {
        const slotStart = i * slotLen;
        const slotEnd = (i + 1) * slotLen;
        const fadeIn = interpolate(
          local,
          [slotStart, slotStart + crossFadeFrames],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.smoothOut,
          },
        );
        const fadeOut = interpolate(
          local,
          [slotEnd - crossFadeFrames, slotEnd],
          [1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASING.smoothOut,
          },
        );
        const opacity = i === screens.length - 1 ? fadeIn : fadeIn * fadeOut;

        // Slight zoom across the slot — keeps motion alive every frame.
        const t = (local - slotStart) / slotLen;
        const tClamped = Math.max(0, Math.min(1, t));
        const zoom = 1.0 + tClamped * 0.06;
        const driftX = (i - 1) * 4;
        const lift = (1 - fadeIn) * 18;

        const slotStyle: CSSProperties = {
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          opacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "70px 140px 110px",
        };

        const captionT = interpolate(
          local,
          [slotStart + crossFadeFrames, slotStart + crossFadeFrames + 8],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

        return (
          <div key={`${screen}-${i}`} style={slotStyle}>
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "calc(100% - 70px)",
                borderRadius: 20,
                overflow: "hidden",
                boxShadow:
                  "0 60px 120px -20px rgba(53,89,196,0.45), 0 30px 80px -20px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.06)",
                transform: `translateX(${driftX}px) translateY(${lift}px) scale(${zoom})`,
              }}
            >
              <RealUIScreen screen={screen} fit="cover" bare />
            </div>
            <div
              style={{
                marginTop: 18,
                fontFamily: QUESTON_BRAND.fontFamily,
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: QUESTON_BRAND.primaryLight,
                opacity: captionT,
                transform: `translateY(${(1 - captionT) * 6}px)`,
              }}
            >
              {captions[i] ?? ""}
            </div>
          </div>
        );
      })}

      {/* Cobalt rim glow — pulses with each slot to add per-frame motion */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${QUESTON_BRAND.primaryLight}1A, transparent 75%)`,
          mixBlendMode: "screen",
          opacity:
            0.5 +
            0.3 *
              Math.abs(
                Math.sin((local / Math.max(1, slotLen)) * Math.PI),
              ),
        }}
      />
    </div>
  );
}
