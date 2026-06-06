import type { ReactElement } from "react";
import { AbsoluteFill } from "remotion";
import { UIMontage } from "../components";

// Cut 19 — 4.0s. Inline-mock UI Montage — JoinCode → StudentExam → InstructorGrade
// cycle (~1.33s each) with cross-fade + per-slot zoom + caption.
// v6 ★: PNG sources removed. All three slots render inline JSX mocks at native
// 1920×1080 then scale into the framed window — no cropping or aspect issues.
// Captions explicitly prefix "학생 / 강사" so the domain split is unambiguous.
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
          "학생 — AI와 함께 사고",
          "강사 — 사고 과정 평가",
        ]}
      />
    </AbsoluteFill>
  );
}
