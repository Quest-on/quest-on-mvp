// @vitest-environment jsdom
/**
 * 교수 채점 화면은 분석 파트너 문항이 있는 시험에서만 실행 기록을 부른다 (#564 8번)
 *
 * 채점 화면이 시험 종류와 상관없이 `/api/session/<id>/analysis` 를 불렀다. 그 라우트는 분당 30회 한도라 학생을 빠르게
 * 넘기면 429 가 나고, 분석 문항이 없는 일반 시험 채점 화면에도 "실행 기록을 불러오지 못했습니다" 배너가 떴다.
 *
 * 실제 채점 페이지와 실제 대화 카드(`AIConversationsCard`)를 jsdom 에 렌더한다. 무거운 다른 카드는 빈 컴포넌트로 바꾸고,
 * fetch 는 채점 데이터와 실행 기록 응답을 흉내 낸다. 보는 것:
 *   1. 일반 시험은 실행 기록을 부르지 않고 배너도 없다(기록 라우트가 429 를 돌려줄 상황이어도).
 *   2. 분석 파트너 문항이 있으면 부르고, 429 면 지금처럼 배너와 다시 시도를 보인다.
 *   3. 문항의 ai_role 은 서버가 정확히 "analysis_partner" 일 때만 분석 문항으로 본다(대소문자, 다른 값은 일반 시험).
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
const BANNER = "실행 기록을 불러오지 못했습니다.";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/AppAuthProvider", () => ({
  useAppUser: () => ({ isSignedIn: true, isLoaded: true, profile: { role: "instructor" } }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/link", () => ({ default: ({ children }: { children?: unknown }) => children ?? null }));
// 이 시험에서 보려는 것은 대화 카드의 배너뿐이다. 나머지 카드는 비운다.
vi.mock("@/components/chat/AIMessageRenderer", () => ({ default: () => null }));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children?: unknown }) => children ?? null,
  SidebarInset: ({ children }: { children?: unknown }) => children ?? null,
}));
vi.mock("@/components/ui/rich-text-viewer", () => ({ RichTextViewer: () => null }));
vi.mock("@/components/instructor/GradeHeader", () => ({ GradeHeader: () => null }));
vi.mock("@/components/instructor/QuestionNavigation", () => ({ QuestionNavigation: () => null }));
vi.mock("@/components/instructor/QuestionPromptCard", () => ({ QuestionPromptCard: () => null }));
vi.mock("@/components/instructor/FinalAnswerCard", () => ({ FinalAnswerCard: () => null }));
vi.mock("@/components/instructor/IntegritySignalsToggle", () => ({ IntegritySignalsToggle: () => null }));
vi.mock("@/hooks/useIntegritySignalsPreference", () => ({ useIntegritySignalsPreference: () => [false, vi.fn()] }));
vi.mock("@/components/instructor/ObjectiveGradeCard", () => ({ ObjectiveGradeCard: () => null }));
vi.mock("@/components/instructor/CaseGradingChat", () => ({ CaseGradingChat: () => null }));
vi.mock("@/components/instructor/SessionQuizResultsCard", () => ({ SessionQuizResultsCard: () => null }));
vi.mock("@/components/instructor/QuestionAiSummaryCard", () => ({ QuestionAiSummaryCard: () => null }));
vi.mock("@/components/instructor/AIOverallSummary", () => ({ AIOverallSummary: () => null }));
vi.mock("@/components/instructor/QuickActionsCard", () => ({ QuickActionsCard: () => null }));

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const respond = (status: number, body: unknown): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function sessionData(questions: unknown[]) {
  return {
    session: {
      id: SESSION_ID,
      exam_id: EXAM_ID,
      student_id: "student-1",
      submitted_at: "2026-10-04T00:00:00Z",
      used_clarifications: 0,
      created_at: "2026-10-04T00:00:00Z",
      ai_summary: null,
      auto_submitted: false,
      grading_progress: null,
    },
    exam: { id: EXAM_ID, title: "시험", code: "ABC123", questions },
    student: { name: "학생", email: "student@example.test" },
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
let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(questions: unknown[], analysisStatus: number) {
  fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url === `/api/session/${SESSION_ID}/grade`) return respond(200, sessionData(questions));
    if (url === `/api/session/${SESSION_ID}/analysis`) {
      return analysisStatus === 200 ? respond(200, { turns: [] }) : respond(analysisStatus, { error: "RATE_LIMITED" });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

const analysisCalls = () => fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/analysis")).length;
const text = () => document.body.textContent ?? "";

async function settle(until: () => boolean) {
  for (let i = 0; i < 60 && !until(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  // 조건이 선 뒤에도 늦게 끝나는 조회(실행 기록)가 화면에 반영될 시간을 준다.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

async function renderPage() {
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
  // 대화 카드 제목이 보이면 채점 데이터가 그려진 것이다.
  await settle(() => text().includes("AI와의 대화 기록"));
  expect(text()).toContain("AI와의 대화 기록");
}

beforeEach(() => {
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

describe("일반 시험은 실행 기록을 부르지 않는다 (#564)", () => {
  it("분석 파트너 문항이 없으면 기록 라우트를 부르지 않고, 429 배너도 없다", async () => {
    stubFetch([{ id: "q1", idx: 0, type: "essay", prompt: "문제" }], 429);
    await renderPage();
    expect(analysisCalls()).toBe(0);
    expect(text()).not.toContain(BANNER);
  });

  it("ai_role 이 정확히 analysis_partner 가 아니면(다른 역할, 대소문자 다름) 일반 시험이다", async () => {
    stubFetch(
      [
        { id: "q1", idx: 0, type: "essay", prompt: "문제", ai_role: "case_author" },
        { id: "q2", idx: 1, type: "essay", prompt: "문제", ai_role: "Analysis_Partner" },
      ],
      429
    );
    await renderPage();
    expect(analysisCalls()).toBe(0);
    expect(text()).not.toContain(BANNER);
  });
});

describe("분석 파트너 문항이 있는 시험은 지금처럼 기록을 부른다", () => {
  const ANALYSIS_QUESTIONS = [
    { id: "q1", idx: 0, type: "essay", prompt: "일반 문제" },
    { id: "q2", idx: 1, type: "essay", prompt: "분석 문제", ai_role: "analysis_partner" },
  ];

  it("기록을 부르고, 429 면 빈 기록으로 보이지 않게 배너를 보인다", async () => {
    stubFetch(ANALYSIS_QUESTIONS, 429);
    await renderPage();
    await settle(() => text().includes(BANNER));
    expect(analysisCalls()).toBe(1);
    expect(text()).toContain(BANNER);
  });

  it("기록을 정상으로 받으면 배너가 없다", async () => {
    stubFetch(ANALYSIS_QUESTIONS, 200);
    await renderPage();
    await settle(() => analysisCalls() > 0);
    expect(analysisCalls()).toBe(1);
    expect(text()).not.toContain(BANNER);
  });
});
