import type { ReactElement } from "react";
import { AbsoluteFill } from "remotion";
import { UIMontage } from "../components";

// Cut 19 — 4.0s. NEW: UI Montage — student-exam, instructor-grade, student-dashboard
// cycle through (~1.33s each) with cross-fade + per-slot zoom + caption.
// Replaces v4's dead 12s tail.
export function Cut19(): ReactElement {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <UIMontage
        durationFrames={120}
        startFrame={0}
        screens={["student-exam", "instructor-grade", "student-dashboard"]}
        crossFadeFrames={10}
        captions={[
          "학생 — AI와 함께 사고",
          "강사 — 사고 궤적 평가",
          "학생 — 진행 현황 대시보드",
        ]}
      />
    </AbsoluteFill>
  );
}
