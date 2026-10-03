/**
 * 아직 제출하지 않은(응시 중) 학생의 채점 화면 (이슈 #575).
 *
 * 제출 전 세션은 `sessions.submitted_at` 이 null 이다. 전에는
 *   1) 머리글이 그 값을 확인 없이 `new Date(null)` 로 바꿔 "제출일: 1970. 1. 1." 이 떴고,
 *   2) 채점 결과가 없다는 이유만으로 "자동 채점 결과가 없습니다 — 실행되지 않았거나 실패했습니다"
 *      경고와 "AI 재채점" 단추가 떴다. 채점 전인 것을 실패로 알리고 응시 중 답으로 재채점을 권했다.
 *
 * 제출 여부의 기준은 채점 GET 라우트(`/api/session/[sessionId]/grade`)가 내려주는
 * `session.submitted_at` 이다. 라우트는 `sessions.status` 를 내려주지 않는다.
 *
 * 테스트 방식: 이 저장소에는 `@testing-library/*` 가 없다.
 * - 머리글(`GradeHeader`)은 컴포넌트라 `react-dom/server` 로 실제 ko/en 메시지를 넣어 렌더한다
 *   (`exam-rubric-sheet.test.ts` 와 같은 방식).
 * - 배너는 채점 페이지 안에 있고, 페이지는 react-query 와 인증 컨텍스트에 묶여 있어 렌더하지 않는다
 *   (`integrity-signals-page-wiring.test.ts` 와 같은 이유). 그래서 무엇을 보일지 정하는 판정
 *   (`resolveGradingStatusBanner`)을 순수 함수로 시험하고, 두 채점 페이지가 그 판정에 제출 시각을
 *   넘기는지와 '제출 전' 분기에 재채점 단추가 없는지를 소스에서 본다.
 * 한계: 실제 화면의 배치와 색은 스테이징에서 본다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import koGrading from "../messages/ko/grading.json";
import enGrading from "../messages/en/grading.json";

type Locale = "ko" | "en";
const LOCALES: Locale[] = ["ko", "en"];
const GRADING = { ko: koGrading, en: enGrading };

/** `grading` 네임스페이스에서 점 경로로 문구를 꺼낸다. 없으면 undefined. */
function message(locale: Locale, path: string): string | undefined {
  const value = path
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], GRADING[locale]);
  return typeof value === "string" ? value : undefined;
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

// ── 메시지 ──────────────────────────────────────────────────────────

const NEW_KEYS = [
  "gradeHeader.notSubmitted",
  "gradePage.gradingAwaitingSubmission",
  "assignmentGradePage.notSubmitted",
  "assignmentGradePage.gradingAwaitingSubmission",
];

describe("제출 전 안내 문구 (ko/en)", () => {
  it("두 로케일 모두 비어 있지 않은 문자열로 있다 — 한쪽만 있으면 다른 로케일에 키가 그대로 보인다", () => {
    for (const locale of LOCALES) {
      for (const path of NEW_KEYS) {
        const value = message(locale, path);
        expect(typeof value, `${locale}: grading.${path}`).toBe("string");
        expect(value!.trim(), `${locale}: grading.${path}`).not.toBe("");
      }
    }
  });
});

// ── 머리글 ──────────────────────────────────────────────────────────

async function renderHeader(locale: Locale, submittedAt: string | null): Promise<string> {
  const { GradeHeader } = await import("@/components/instructor/GradeHeader");
  const node: ReactElement = createElement(GradeHeader, {
    studentName: "김학생",
    submittedAt,
    overallScore: null,
    examId: "exam-1",
  });
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: { grading: GRADING[locale] },
      timeZone: "Asia/Seoul",
      children: node,
    }),
  );
}

/** "제출일: {date}" 에서 날짜 앞 이름표 — ko "제출일:", en "Submitted:" */
function submittedLabel(locale: Locale): string {
  return message(locale, "gradeHeader.submittedAt")!.split("{date}")[0].trim();
}

describe("GradeHeader — 아직 제출하지 않은 세션 (submitted_at = null)", () => {
  for (const locale of LOCALES) {
    it(`${locale}: 1970 년 날짜와 제출일 줄 대신 제출 전 문구를 보인다`, async () => {
      const html = await renderHeader(locale, null);
      // new Date(null) 은 UTC 1970-01-01 이다. 서쪽 시간대에서는 1969-12-31 로 그려진다.
      expect(html).not.toMatch(/19(69|70)/);
      expect(html).not.toContain(submittedLabel(locale));
      expect(html).toContain(message(locale, "gradeHeader.notSubmitted"));
    });
  }
});

describe("GradeHeader — 제출한 세션은 지금과 같다", () => {
  const SUBMITTED_AT = "2026-10-06T05:30:00.000Z";
  for (const locale of LOCALES) {
    it(`${locale}: '제출일: <날짜>' 를 그대로 그린다`, async () => {
      const html = await renderHeader(locale, SUBMITTED_AT);
      const expected = message(locale, "gradeHeader.submittedAt")!.replace(
        "{date}",
        new Date(SUBMITTED_AT).toLocaleString(),
      );
      expect(html).toContain(expected);
      expect(html).not.toContain(message(locale, "gradeHeader.notSubmitted"));
    });
  }
});

// ── 배너 판정 ────────────────────────────────────────────────────────

type BannerInput = {
  submittedAt: string | null;
  gradingProgress: { status: "queued" | "running" | "completed" | "failed"; total: number; completed: number; failed: number } | null;
  grades: Array<{ grade_type?: string }>;
  overallScore: number | null;
};

async function bannerFor(overrides: Partial<BannerInput>): Promise<string> {
  const { resolveGradingStatusBanner } = await import("@/lib/grading-status-banner");
  const input: BannerInput = {
    submittedAt: "2026-10-06T05:30:00.000Z",
    gradingProgress: null,
    grades: [],
    overallScore: null,
    ...overrides,
  };
  return resolveGradingStatusBanner(input);
}

const progress = (status: "queued" | "running" | "completed" | "failed") => ({
  status,
  total: 2,
  completed: status === "completed" ? 2 : 0,
  failed: status === "failed" ? 2 : 0,
});

describe("채점 상태 배너 판정 — 아직 제출하지 않은 세션", () => {
  it("채점 결과가 없으면 실패가 아니라 '제출하면 채점이 시작된다' 안내다 (이 이슈의 경우)", async () => {
    expect(await bannerFor({ submittedAt: null })).toBe("awaiting_submission");
  });

  it("진행률이 '완료'로 남아 있어도 결과가 없으면 같은 안내다", async () => {
    expect(await bannerFor({ submittedAt: null, gradingProgress: progress("completed") })).toBe(
      "awaiting_submission",
    );
  });

  it("채점이 진행 중이거나 실패 기록이 있으면 지금처럼 그것을 알린다", async () => {
    expect(await bannerFor({ submittedAt: null, gradingProgress: progress("queued") })).toBe("in_progress");
    expect(await bannerFor({ submittedAt: null, gradingProgress: progress("failed") })).toBe("failed");
    expect(await bannerFor({ submittedAt: null, grades: [{ grade_type: "ai_failed" }] })).toBe("failed");
  });

  it("보일 결과(점수나 grade 행)가 있으면 배너가 없다", async () => {
    expect(await bannerFor({ submittedAt: null, overallScore: 0 })).toBe("none");
    expect(await bannerFor({ submittedAt: null, grades: [{ grade_type: "ai_summary" }] })).toBe("none");
  });
});

describe("채점 상태 배너 판정 — 제출한 세션은 지금과 같다 (자동 제출도 submitted_at 이 채워진다)", () => {
  it("결과가 하나도 없으면 '자동 채점 결과가 없습니다' 경고(재채점 단추)", async () => {
    expect(await bannerFor({})).toBe("absent");
    expect(await bannerFor({ gradingProgress: progress("completed") })).toBe("absent");
  });

  it("queued·running 이면 진행률", async () => {
    expect(await bannerFor({ gradingProgress: progress("queued") })).toBe("in_progress");
    expect(await bannerFor({ gradingProgress: progress("running") })).toBe("in_progress");
  });

  it("진행 중이면 실패 행이 섞여 있어도 진행률이 먼저다", async () => {
    expect(
      await bannerFor({ gradingProgress: progress("running"), grades: [{ grade_type: "ai_failed" }] }),
    ).toBe("in_progress");
  });

  it("진행률 실패나 ai_failed 행이면 실패 경고(재채점 단추)", async () => {
    expect(await bannerFor({ gradingProgress: progress("failed") })).toBe("failed");
    expect(await bannerFor({ grades: [{ grade_type: "ai_failed" }] })).toBe("failed");
  });

  it("점수나 grade 행이 있으면 배너가 없다", async () => {
    expect(await bannerFor({ grades: [{ grade_type: "manual" }] })).toBe("none");
    expect(await bannerFor({ overallScore: 80 })).toBe("none");
  });
});

// ── 페이지 배선 ──────────────────────────────────────────────────────

const PAGES = [
  { name: "시험 채점", path: "app/(app)/instructor/[examId]/grade/[studentId]/page.tsx", ns: "gradePage" },
  {
    name: "과제 채점",
    path: "app/(app)/instructor/assignment/[assignmentId]/grade/[sessionId]/page.tsx",
    ns: "assignmentGradePage",
  },
] as const;

/** `marker` 다음에 처음 여는 `{` 부터 짝이 맞는 `}` 까지. */
function blockAfter(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `${marker} 가 있다`).toBeGreaterThan(-1);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`${marker} 뒤 블록의 괄호가 맞지 않는다`);
}

describe.each(PAGES)("$name 페이지 배선", ({ path, ns }) => {
  const page = read(path);

  it("세션의 submitted_at 을 null 일 수 있는 값으로 받는다", () => {
    expect(page).toMatch(/interface SessionData \{\s*session: \{[^}]*submitted_at: string \| null;/);
  });

  it("배너 판정에 세션의 submitted_at 을 넘긴다", () => {
    expect(page).toMatch(
      /import\s*\{[^}]*\bresolveGradingStatusBanner\b[^}]*\}\s*from\s*["']@\/lib\/grading-status-banner["']/,
    );
    expect(page).toMatch(
      /resolveGradingStatusBanner\(\{[^}]*submittedAt:\s*sessionData\.session\.submitted_at\b[^}]*\}\)/,
    );
  });

  it("'제출 전' 분기는 안내만 보이고 재채점 단추는 없다", () => {
    const branch = blockAfter(page, '=== "awaiting_submission"');
    expect(branch).toContain(`t("${ns}.gradingAwaitingSubmission")`);
    expect(branch).toContain("return");
    expect(branch).not.toContain("handleRegrade");
    expect(branch).not.toContain("regradeButton");
    expect(branch).not.toContain("<Button");
  });

  it("제출 시각으로 날짜를 만들 때는 값이 있는지 먼저 본다", () => {
    let from = 0;
    for (;;) {
      const at = page.indexOf("new Date(sessionData.session.submitted_at", from);
      if (at === -1) break;
      const before = page.slice(Math.max(0, at - 200), at);
      expect(before, "new Date(submitted_at) 앞에 null 확인이 있다").toMatch(
        /sessionData\.session\.submitted_at\s*(\?|&&)/,
      );
      from = at + 1;
    }
  });
});

describe("머리글 배선", () => {
  it("시험 채점 페이지는 submitted_at 을 그대로 GradeHeader 에 넘긴다 (null 처리는 GradeHeader 가 한다)", () => {
    const page = read(PAGES[0].path);
    expect(page).toMatch(/<GradeHeader[\s\S]*?submittedAt=\{sessionData\.session\.submitted_at\}/);
  });

  it("과제 채점 페이지는 제출 전이면 제출 전 문구를 보인다", () => {
    const page = read(PAGES[1].path);
    expect(page).toContain('t("assignmentGradePage.notSubmitted")');
  });
});
