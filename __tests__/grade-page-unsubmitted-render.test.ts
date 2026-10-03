// @vitest-environment jsdom
/**
 * 시험 채점 화면을 실제로 그려 제출 전 세션과 제출한 세션을 비교한다 (이슈 #575).
 *
 * `grade-analysis-records-scope.test.ts` 와 같은 방식이다. 실제 채점 페이지와 실제 머리글(`GradeHeader`)을 jsdom 에
 * 렌더하고, 이 검사와 상관없는 카드는 빈 컴포넌트로 바꾼다. AI 채점 대화 패널은 받은 props 만 적어 둔다(패널이 그 값으로
 * 대화 기록을 부르는지는 `case-grading-chat-history-gate.test.ts` 가 본다). fetch 는 채점 데이터 응답만 흉내 낸다.
 *
 * 보는 것:
 *   1. 응시 중(제출 전, 시험 진행 중): 1970 년 날짜가 없고 '제출 전' 문구가 보인다. '결과 없음' 경고와 재채점 단추 대신
 *      '제출하면 자동 채점이 시작된다' 안내가 보인다. 대화 기록은 부르지 않는다.
 *   2. 제출했고 시험이 끝났는데 결과가 없음: 제출일, '결과 없음' 경고, 재채점 단추가 지금과 같다. 대화 기록을 부른다.
 *   3. 제출했고 시험이 진행 중: 경고와 단추는 지금과 같다. 대화 기록은 부르지 않는다(서버가 409 로 거절한다).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, Suspense, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import koGrading from "../messages/ko/grading.json";
import koExam from "../messages/ko/exam.json";
import koCommon from "../messages/ko/common.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EXAM_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const STUDENT_NAME = "김응시";
const SUBMITTED_AT = "2026-10-06T05:30:00.000Z";

const { chatProps } = vi.hoisted(() => ({ chatProps: [] as Array<{ historyEnabled?: boolean }> }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/AppAuthProvider", () => ({
  useAppUser: () => ({ isSignedIn: true, isLoaded: true, profile: { role: "instructor" } }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/link", () => ({ default: ({ children }: { children?: unknown }) => children ?? null }));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children?: unknown }) => children ?? null,
  SidebarInset: ({ children }: { children?: unknown }) => children ?? null,
}));
vi.mock("@/components/ui/rich-text-viewer", () => ({ RichTextViewer: () => null }));
vi.mock("@/components/instructor/QuestionNavigation", () => ({ QuestionNavigation: () => null }));
vi.mock("@/components/instructor/QuestionPromptCard", () => ({ QuestionPromptCard: () => null }));
vi.mock("@/components/instructor/AIConversationsCard", () => ({ AIConversationsCard: () => null }));
vi.mock("@/components/instructor/FinalAnswerCard", () => ({ FinalAnswerCard: () => null }));
vi.mock("@/components/instructor/IntegritySignalsToggle", () => ({ IntegritySignalsToggle: () => null }));
vi.mock("@/hooks/useIntegritySignalsPreference", () => ({ useIntegritySignalsPreference: () => [false, vi.fn()] }));
vi.mock("@/components/instructor/ObjectiveGradeCard", () => ({ ObjectiveGradeCard: () => null }));
vi.mock("@/components/instructor/CaseGradingChat", () => ({
  CaseGradingChat: (props: { historyEnabled?: boolean }) => {
    chatProps.push(props);
    return null;
  },
}));
vi.mock("@/components/instructor/SessionQuizResultsCard", () => ({ SessionQuizResultsCard: () => null }));
vi.mock("@/components/instructor/QuestionAiSummaryCard", () => ({ QuestionAiSummaryCard: () => null }));
vi.mock("@/components/instructor/AIOverallSummary", () => ({ AIOverallSummary: () => null }));
vi.mock("@/components/instructor/QuickActionsCard", () => ({ QuickActionsCard: () => null }));

/** 채점 GET 라우트 응답 모양. 문항은 서술형 하나, 채점 결과와 진행률은 없다. */
function gradeResponse(opts: { submittedAt: string | null; examStatus: "running" | "closed" }) {
  return {
    session: {
      id: SESSION_ID,
      exam_id: EXAM_ID,
      student_id: "student-1",
      submitted_at: opts.submittedAt,
      used_clarifications: 0,
      created_at: "2026-10-06T00:00:00Z",
      ai_summary: null,
      auto_submitted: false,
      grading_progress: null,
    },
    exam: {
      id: EXAM_ID,
      title: "모의시험",
      code: "ABC123",
      questions: [{ id: "q1", idx: 0, type: "essay", prompt: "문제" }],
      status: opts.examStatus,
      type: "exam",
      deadline: null,
      is_demo: false,
    },
    student: { name: STUDENT_NAME, email: "student@example.test" },
    submissions: {},
    messages: {},
    grades: {},
    pasteLogs: {},
    overallScore: null,
    gradingProgress: null,
  };
}

let root: Root | null = null;
let container: HTMLDivElement;

const text = () => document.body.textContent ?? "";
const regradeButtons = () =>
  Array.from(document.querySelectorAll("button")).filter((b) =>
    (b.textContent ?? "").includes(koGrading.gradePage.regradeButton),
  );

async function settle(until: () => boolean) {
  for (let i = 0; i < 60 && !until(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

async function renderPage(body: ReturnType<typeof gradeResponse>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === `/api/session/${SESSION_ID}/grade`) return { ok: true, status: 200, json: async () => body };
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  const { default: GradeStudentPage } = await import("@/app/(app)/instructor/[examId]/grade/[studentId]/page");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const params = Promise.resolve({ examId: EXAM_ID, studentId: SESSION_ID });
  const tree: ReactElement = createElement(QueryClientProvider, {
    client,
    children: createElement(NextIntlClientProvider, {
      locale: "ko",
      messages: { grading: koGrading, exam: koExam, common: koCommon },
      timeZone: "Asia/Seoul",
      children: createElement(Suspense, { fallback: null }, createElement(GradeStudentPage, { params })),
    }),
  });
  root = createRoot(container);
  await act(async () => {
    root!.render(tree);
  });
  // 머리글 제목이 보이면 채점 데이터가 그려진 것이다.
  const title = koGrading.gradeHeader.studentGradeTitle.replace("{studentName}", STUDENT_NAME);
  await settle(() => text().includes(title));
  expect(text()).toContain(title);
}

beforeEach(() => {
  chatProps.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("시험 채점 화면 — 응시 중(아직 제출하지 않은) 학생", () => {
  it("1970 날짜, '결과 없음' 경고, 재채점 단추 없이 제출 전 문구와 안내를 보이고 대화 기록은 부르지 않는다", async () => {
    await renderPage(gradeResponse({ submittedAt: null, examStatus: "running" }));

    expect(text()).not.toMatch(/19(69|70)/);
    expect(text()).toContain(koGrading.gradeHeader.notSubmitted);
    expect(text()).not.toContain("제출일:");

    expect(text()).toContain(koGrading.gradePage.gradingAwaitingSubmission);
    expect(text()).not.toContain(koGrading.gradePage.noGradesTitle);
    expect(text()).not.toContain(koGrading.gradePage.gradingAbsentDesc);
    expect(regradeButtons()).toHaveLength(0);

    expect(chatProps.at(-1)?.historyEnabled).toBe(false);
  });
});

describe("시험 채점 화면 — 제출한 학생은 지금과 같다", () => {
  it("시험이 끝났는데 결과가 없으면: 제출일, '결과 없음' 경고, 재채점 단추. 대화 기록을 부른다", async () => {
    await renderPage(gradeResponse({ submittedAt: SUBMITTED_AT, examStatus: "closed" }));

    expect(text()).toContain(
      koGrading.gradeHeader.submittedAt.replace("{date}", new Date(SUBMITTED_AT).toLocaleString()),
    );
    expect(text()).not.toContain(koGrading.gradeHeader.notSubmitted);

    expect(text()).toContain(koGrading.gradePage.noGradesTitle);
    expect(text()).toContain(koGrading.gradePage.gradingAbsentDesc);
    expect(regradeButtons()).toHaveLength(1);
    expect(text()).not.toContain(koGrading.gradePage.gradingAwaitingSubmission);

    // 값을 넘기지 않으면 패널 기본값(true)이다.
    expect(chatProps.at(-1)?.historyEnabled ?? true).toBe(true);
  });

  it("시험이 진행 중이면: 경고와 단추는 그대로, 대화 기록은 부르지 않는다(서버가 409 로 거절한다)", async () => {
    await renderPage(gradeResponse({ submittedAt: SUBMITTED_AT, examStatus: "running" }));

    expect(text()).toContain(koGrading.gradePage.noGradesTitle);
    expect(regradeButtons()).toHaveLength(1);
    expect(chatProps.at(-1)?.historyEnabled).toBe(false);
  });
});
