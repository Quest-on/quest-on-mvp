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

function renderScreen(
  kind: MontageScreenKind,
  slotStartFrame: number,
): ReactNode {
  switch (kind) {
    case "join-code":
      return <JoinCodeMock compact />;
    case "student-exam":
      return (
        <StudentExamMock
          streaming
          startFrame={slotStartFrame - 80}
          showAnswerTyping={false}
        />
      );
    case "instructor-grade":
      return (
        <InstructorGradeMock streaming startFrame={slotStartFrame - 60} />
      );
    default:
      return null;
  }
}

// v7 montage — same framing as v6 UIMontage, but each slot renders an inline
// JSX mock with SSE streaming aligned to the slot start (so the AI chat /
// AI summary streaming starts when the slot fades in, not at Cut 19 frame 0).
// Caption labels keep "학생/강사" prefix to preserve B2B domain clarity.
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
          padding: "24px 60px 56px",
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
                height: "calc(100% - 50px)",
                borderRadius: 20,
                overflow: "hidden",
                background: "#000",
                boxShadow:
                  "0 60px 120px -20px rgba(53,89,196,0.45), 0 30px 80px -20px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.06)",
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
                    transform: "scale(0.84)",
                    transformOrigin: "center",
                  }}
                >
                  {renderScreen(kind, slotStart)}
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
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

    </div>
  );
}
