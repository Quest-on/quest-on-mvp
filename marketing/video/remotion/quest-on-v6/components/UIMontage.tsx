import type { CSSProperties, ReactElement, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";
import { JoinCodeMock } from "./JoinCodeMock";
import { StudentExamMock } from "./StudentExamMock";
import { InstructorGradeMock } from "./InstructorGradeMock";

export type MontageScreenKind =
  | "join-code"
  | "student-exam"
  | "instructor-grade";

export interface UIMontageProps {
  durationFrames: number;
  startFrame?: number;
  screens?: readonly MontageScreenKind[];
  crossFadeFrames?: number;
  captions?: readonly string[];
}

const DEFAULT_SCREENS: readonly MontageScreenKind[] = [
  "join-code",
  "student-exam",
  "instructor-grade",
];

const DEFAULT_CAPTIONS: readonly string[] = [
  "학생 — 코드로 입장",
  "학생 — AI와 함께 사고",
  "강사 — 사고 과정 평가",
];

function renderScreen(kind: MontageScreenKind): ReactNode {
  switch (kind) {
    case "join-code":
      return <JoinCodeMock />;
    case "student-exam":
      return <StudentExamMock />;
    case "instructor-grade":
      return <InstructorGradeMock />;
    default:
      return null;
  }
}

// v6 montage — same framing as v5 UIMontage, but each slot renders an inline
// JSX mock instead of a PNG <Img>. Caption labels keep "학생/강사" prefix to
// preserve B2B domain clarity.
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
      {screens.map((kind, i) => {
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

        // Inner mock fits a 1920×1080 surface; scale it down to fit the framed slot.
        // The framed slot is the available height; pick scale so width fills.
        return (
          <div key={`${kind}-${i}`} style={slotStyle}>
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "calc(100% - 70px)",
                borderRadius: 20,
                overflow: "hidden",
                background: "#000",
                boxShadow:
                  "0 60px 120px -20px rgba(53,89,196,0.45), 0 30px 80px -20px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.06)",
                transform: `translateX(${driftX}px) translateY(${lift}px) scale(${zoom})`,
              }}
            >
              {/* Mock is rendered at native 1920×1080 then scaled to slot. */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: 1920,
                    height: 1080,
                    transform: "scale(0.86)",
                    transformOrigin: "center",
                  }}
                >
                  {renderScreen(kind)}
                </div>
              </div>
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
