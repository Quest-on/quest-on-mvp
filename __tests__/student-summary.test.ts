import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  caseStatusLabel,
  dashboardStatus,
  dashboardStatusLabel,
  dashboardStatusSortRank,
  overallScoreLabel,
  type ExamStudentDashboardStatus,
  type ExamStudentSummary,
  type StudentLabelMessage,
} from "@/lib/types/student-summary";

function student(overrides: Partial<ExamStudentSummary> = {}): ExamStudentSummary {
  return {
    sessionId: "session-1",
    studentId: "student-1",
    name: "Test Student",
    status: "submitted",
    mcq: { correct: 0, total: 0 },
    ox: { correct: 0, total: 0 },
    caseProgress: { submitted: 1, graded: 0, total: 1 },
    overallStatus: "pending",
    ...overrides,
  };
}

// 컴포넌트는 useTranslations("grading") 의 t(key, values) 로 푼다. 같은 일을 메시지
// 파일로 직접 해서, 화면에 실제로 나갈 문구를 로케일별로 본다.
function grading(locale: "ko" | "en"): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(process.cwd(), `messages/${locale}/grading.json`), "utf8"),
  );
}
const messages = { ko: grading("ko"), en: grading("en") };

function render(label: StudentLabelMessage | null, locale: "ko" | "en"): string {
  // 빈 칸은 문구가 아니라 표 기호다 — 컴포넌트가 "—" 로 그린다.
  if (label === null) return "—";
  const template = label.key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages[locale]);
  if (typeof template !== "string") throw new Error(`${locale}: missing ${label.key}`);
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(label.values?.[name]));
}
const ko = (label: StudentLabelMessage | null) => render(label, "ko");

describe("student summary display helpers", () => {
  it("shows narrative submission state without grade progress", () => {
    expect(
      ko(caseStatusLabel("submitted", { submitted: 1, graded: 0, total: 1 })),
    ).toBe("제출됨");
    expect(
      ko(caseStatusLabel("submitted", { submitted: 1, graded: 0, total: 2 })),
    ).toBe("일부 제출 1/2");
    expect(
      ko(caseStatusLabel("submitted", { submitted: 0, graded: 0, total: 1 })),
    ).toBe("미제출");
    expect(
      ko(caseStatusLabel("in-progress", { submitted: 1, graded: 0, total: 1 })),
    ).toBe("—");
  });

  it("prefers final scores over proposed scores", () => {
    expect(ko(overallScoreLabel(student({ overallScore: 82 })))).toBe("82점");
    expect(ko(overallScoreLabel(student({ proposedOverallScore: 82 })))).toBe(
      "가채점 82점",
    );
    expect(
      ko(overallScoreLabel(student({ overallScore: 82, proposedOverallScore: 40 }))),
    ).toBe("82점");
    expect(ko(overallScoreLabel(student()))).toBe("—");
  });

  it("uses final grade evidence before stale bulk failures", () => {
    expect(
      ko(
        dashboardStatusLabel(
          dashboardStatus(
            student({
              overallStatus: "manually_graded",
              bulkGradeStatus: "failed",
            }),
          ),
        ),
      ),
    ).toBe("채점완료");
    expect(
      ko(
        dashboardStatusLabel(
          dashboardStatus(
            student({
              overallStatus: "pending",
              bulkGradeStatus: "proposed_ready",
              proposedOverallScore: 82,
            }),
          ),
        ),
      ),
    ).toBe("가채점완료");
    expect(
      ko(
        dashboardStatusLabel(
          dashboardStatus(
            student({
              overallStatus: "pending",
              bulkGradeStatus: "grading",
            }),
          ),
        ),
      ),
    ).toBe("채점중");
  });

  it("does not treat committed bulk state alone as final grading evidence", () => {
    expect(
      ko(
        dashboardStatusLabel(
          dashboardStatus(
            student({
              overallStatus: "pending",
              bulkGradeStatus: "committed",
            }),
          ),
        ),
      ),
    ).toBe("채점대기");

    expect(
      ko(
        dashboardStatusLabel(
          dashboardStatus(
            student({
              overallStatus: "pending",
              overallScore: 82,
              bulkGradeStatus: "committed",
            }),
          ),
        ),
      ),
    ).toBe("채점완료");
  });

  it("sorts by the same unified status used by the dashboard badge", () => {
    expect(dashboardStatusSortRank("in-progress")).toBeLessThan(
      dashboardStatusSortRank("pending"),
    );
    expect(dashboardStatusSortRank("grading")).toBeLessThan(
      dashboardStatusSortRank("proposed-ready"),
    );
    expect(dashboardStatusSortRank("proposed-ready")).toBeLessThan(
      dashboardStatusSortRank("graded"),
    );
  });
});

// #494 — 이 라벨들이 한국어로 하드코딩돼 영어 로케일에서도 "채점중"·"제출됨" 이 나왔다.
describe("student summary labels are locale-neutral (#494)", () => {
  const statuses: ExamStudentDashboardStatus[] = [
    "not-started",
    "in-progress",
    "pending",
    "grading",
    "proposed-ready",
    "graded",
    "failed",
  ];
  const allLabels: (StudentLabelMessage | null)[] = [
    ...statuses.map((s) => dashboardStatusLabel(s)),
    caseStatusLabel("submitted", { submitted: 1, graded: 0, total: 1 }),
    caseStatusLabel("submitted", { submitted: 1, graded: 0, total: 2 }),
    caseStatusLabel("submitted", { submitted: 0, graded: 0, total: 1 }),
    caseStatusLabel("in-progress", { submitted: 0, graded: 0, total: 1 }),
    overallScoreLabel(student({ overallScore: 82 })),
    overallScoreLabel(student({ proposedOverallScore: 82 })),
    overallScoreLabel(student()),
  ];

  it("lib 는 문구가 아니라 번역 키를 돌려준다 — 한글이 섞이지 않는다", () => {
    for (const label of allLabels) {
      expect(JSON.stringify(label)).not.toMatch(/[가-힣]/);
    }
  });

  it("모든 키가 ko·en 양쪽에 있고, en 문구에는 한글이 없다", () => {
    for (const label of allLabels) {
      expect(render(label, "ko")).toBeTruthy();
      expect(render(label, "en")).not.toMatch(/[가-힣]/);
    }
  });

  it("en 에서는 영어로 나온다", () => {
    expect(render(dashboardStatusLabel("grading"), "en")).toBe("Grading");
    expect(render(dashboardStatusLabel("pending"), "en")).toBe("Awaiting grading");
    expect(
      render(caseStatusLabel("submitted", { submitted: 1, graded: 0, total: 1 }), "en"),
    ).toBe("Submitted");
    expect(render(overallScoreLabel(student({ proposedOverallScore: 82 })), "en")).toBe(
      "Draft 82 pts",
    );
  });
});
