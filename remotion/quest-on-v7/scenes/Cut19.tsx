import type { ReactElement } from "react";
import { AbsoluteFill } from "remotion";
import { UIMontage } from "../components";

// Cut 19 — 4.0s. UI Montage — JoinCode → StudentExam → InstructorGrade
// cycle (~1.33s each) with cross-fade + per-slot zoom + caption.
// v7 ★: each slot now renders streaming-aware mocks aligned to slot start —
// the student slot opens with chat already streaming, the instructor slot
// opens with AI 분석 중 / score count-up. Captions keep "학생/강사" prefix.
export function Cut19(): ReactElement {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <UIMontage
        durationFrames={120}
        startFrame={0}
        screens={["join-code", "student-exam", "instructor-grade"]}
        crossFadeFrames={10}
        captions={[
          "학생 — 코드로 입장",
          "학생 — AI와 함께 풀기",
          "강사 — AI 채점 리뷰",
        ]}
      />
    </AbsoluteFill>
  );
}
