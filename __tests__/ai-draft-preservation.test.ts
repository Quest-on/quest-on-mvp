/**
 * AI 문항 초안 보존 (028_grade_provenance)
 *
 * 버그: `exams.questions` 는 단일 JSON blob 이라 저장할 때마다 통째로 덮어쓴다.
 * AI 가 문항을 생성하고 교수자가 그것을 편집하면 원본 AI 초안은 사라지고,
 * "교수자가 무엇을 바꿨는가" 를 아무도 알 수 없다.
 *
 * 이 파일의 첫 describe 는 그 덮어쓰기 동작 자체를 고정하는 characterization 테스트다
 * (수정 전 코드에서도 통과해야 한다). 뒤따르는 describe 들이 실제 보존 요구사항을 잠근다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, logErrorMock, auditLogMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  logErrorMock: vi.fn(),
  auditLogMock: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));
vi.mock("@/lib/audit", () => ({ auditLog: auditLogMock }));

import { updateExam } from "@/app/api/supa/handlers/exam-handlers";
import { updateAssignment } from "@/app/api/supa/handlers/assignment-handlers";

const INSTRUCTOR_ID = "instructor-1";
const EXAM_ID = "11111111-1111-4111-8111-111111111111";

type QueryResult = { data: unknown; error: unknown };

/** Supabase query-builder 스텁. `update()` 로 넘어온 페이로드를 그대로 기록한다. */
function createChain(result: QueryResult = { data: null, error: null }) {
  const captured: Record<string, unknown>[] = [];
  const builder = {
    captured,
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    update: vi.fn((payload: Record<string, unknown>) => {
      captured.push(payload);
      return builder;
    }),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

/**
 * `updateExam` 의 questions 경로가 실제로 호출하는 순서대로 스텁을 큐에 넣는다:
 *   exams(select) → sessions(limit) → exams(update)
 */
function queueExamUpdate(storedExam: Record<string, unknown>) {
  // 호출 "순서" 가 아니라 종결 메서드로 구분한다. questions 를 건드리지 않는 업데이트는
  // 선행 select 를 아예 하지 않으므로, 고정 큐로 짜면 하네스가 어긋난다.
  const exams = createChain({ data: { id: EXAM_ID }, error: null });
  exams.maybeSingle.mockResolvedValue({ data: storedExam, error: null });
  const sessionsCheck = createChain({ data: [], error: null });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "exams") return exams;
    if (table === "sessions") return sessionsCheck;
    throw new Error(`No mock configured for table ${table}`);
  });

  return exams;
}

/** 마지막으로 DB 에 전송된 update 페이로드. */
async function capturePayload(
  storedExam: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const examUpdate = queueExamUpdate(storedExam);
  const res = await updateExam({ id: EXAM_ID, update });
  expect(res.status).toBe(200);
  expect(examUpdate.captured).toHaveLength(1);
  return examUpdate.captured[0];
}

const AI_DRAFT = [
  { id: "q1", text: "AI가 생성한 1번 문항", type: "essay" },
  { id: "q2", text: "AI가 생성한 2번 문항", type: "essay" },
];

const INSTRUCTOR_EDIT = [
  { id: "q1", text: "교수자가 고쳐 쓴 1번 문항", type: "essay" },
  { id: "q2", text: "AI가 생성한 2번 문항", type: "essay" },
];

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
});

// ─────────────────────────────────────────────────────────────
// STEP 1 — 기준선(characterization): 수정 전 코드에서도 통과해야 한다
// ─────────────────────────────────────────────────────────────
describe("기준선 — questions 는 통째로 덮어쓰기된다", () => {
  it("update 페이로드의 questions 가 기존 값과 병합되지 않고 새 배열 그대로다", async () => {
    const payload = await capturePayload(
      { id: EXAM_ID, questions: AI_DRAFT, score_weights: null },
      { questions: INSTRUCTOR_EDIT }
    );

    // 병합/append 가 아니라 통째 교체다 — 이전 문항은 흔적도 남지 않는다.
    expect(payload.questions).toEqual(INSTRUCTOR_EDIT);
    expect(payload.questions).toHaveLength(2);
    expect(JSON.stringify(payload.questions)).not.toContain("AI가 생성한 1번 문항");
  });

  it("questions 를 빈 배열로 덮어써도 기존 문항을 되살리지 않는다", async () => {
    const payload = await capturePayload(
      { id: EXAM_ID, questions: AI_DRAFT, score_weights: null },
      { questions: [] }
    );

    expect(payload.questions).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// STEP 2 — AI 초안 보존 요구사항
// ─────────────────────────────────────────────────────────────

/** DB 행에 update 페이로드를 적용한 결과 (실제 저장 결과 시뮬레이션). */
function applyUpdate(
  stored: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, unknown> {
  return { ...stored, ...payload };
}

const SECOND_GENERATION = [
  { id: "q9", text: "두 번째 생성으로 나온 완전히 다른 문항", type: "essay" },
];

describe("AI 초안 보존 — updateExam", () => {
  it("(i) 문항이 처음 채워질 때 ai_draft_questions 와 생성 시각을 함께 기록한다", async () => {
    const payload = await capturePayload(
      { id: EXAM_ID, questions: [], score_weights: null, ai_draft_questions: null },
      { questions: AI_DRAFT }
    );

    expect(payload.ai_draft_questions).toEqual(AI_DRAFT);
    expect(typeof payload.ai_draft_generated_at).toBe("string");
    expect(new Date(payload.ai_draft_generated_at as string).toISOString()).toBe(
      payload.ai_draft_generated_at
    );
    // 확정 문항 자체는 그대로 저장된다.
    expect(payload.questions).toEqual(AI_DRAFT);
  });

  it("(ii) 이후 교수자 편집은 ai_draft_questions 를 바이트 단위로 그대로 둔다", async () => {
    const stored = {
      id: EXAM_ID,
      questions: AI_DRAFT,
      score_weights: null,
      ai_draft_questions: AI_DRAFT,
      ai_draft_generated_at: "2026-08-11T00:00:00.000Z",
    };
    const before = JSON.stringify(stored.ai_draft_questions);

    const payload = await capturePayload(stored, { questions: INSTRUCTOR_EDIT });

    // 키가 아예 없어야 한다 — null 로 보내는 것도 초안을 파괴한다.
    expect(payload).not.toHaveProperty("ai_draft_questions");
    expect(payload).not.toHaveProperty("ai_draft_generated_at");

    const after = applyUpdate(stored, payload);
    expect(JSON.stringify(after.ai_draft_questions)).toBe(before);
    expect(after.ai_draft_generated_at).toBe("2026-08-11T00:00:00.000Z");
    // 교수자 편집본은 정상적으로 반영된다.
    expect(after.questions).toEqual(INSTRUCTOR_EDIT);
  });

  it("(iii) 재생성은 이미 저장된 ai_draft_questions 를 덮어쓰지 않는다", async () => {
    // 교수자가 문항을 전부 지우고 다시 생성한 상황: questions 는 비었지만 초안은 이미 있다.
    const stored = {
      id: EXAM_ID,
      questions: [],
      score_weights: null,
      ai_draft_questions: AI_DRAFT,
      ai_draft_generated_at: "2026-08-11T00:00:00.000Z",
    };
    const before = JSON.stringify(stored.ai_draft_questions);

    const payload = await capturePayload(stored, { questions: SECOND_GENERATION });

    expect(payload).not.toHaveProperty("ai_draft_questions");
    expect(payload).not.toHaveProperty("ai_draft_generated_at");

    const after = applyUpdate(stored, payload);
    expect(JSON.stringify(after.ai_draft_questions)).toBe(before);
    expect(after.ai_draft_generated_at).toBe("2026-08-11T00:00:00.000Z");
  });

  it("questions 를 건드리지 않는 업데이트는 초안 컬럼을 절대 보내지 않는다", async () => {
    const payload = await capturePayload(
      { id: EXAM_ID, questions: [], score_weights: null, ai_draft_questions: null },
      { duration: 90 }
    );

    expect(payload).not.toHaveProperty("ai_draft_questions");
    expect(payload).not.toHaveProperty("ai_draft_generated_at");
  });

  it("빈 문항으로 저장할 때는 초안을 만들지 않는다", async () => {
    const payload = await capturePayload(
      { id: EXAM_ID, questions: [], score_weights: null, ai_draft_questions: null },
      { questions: [] }
    );

    expect(payload).not.toHaveProperty("ai_draft_questions");
    expect(payload).not.toHaveProperty("ai_draft_generated_at");
  });
});

/** `updateAssignment` 호출 경로: exams(select) → sessions(limit) → exams(update) */
async function captureAssignmentPayload(
  storedExam: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const exams = createChain({ data: null, error: null });
  exams.maybeSingle.mockResolvedValue({ data: storedExam, error: null });
  const sessionsCheck = createChain({ data: [], error: null });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "exams") return exams;
    if (table === "sessions") return sessionsCheck;
    throw new Error(`No mock configured for table ${table}`);
  });

  const res = await updateAssignment({ id: EXAM_ID, update });
  expect(res.status).toBe(200);
  expect(exams.captured).toHaveLength(1);
  return exams.captured[0];
}

describe("AI 초안 보존 — updateAssignment", () => {
  const base = { id: EXAM_ID, instructor_id: INSTRUCTOR_ID, type: "assignment" };

  it("(i) 문항이 처음 채워질 때 초안을 기록한다", async () => {
    const payload = await captureAssignmentPayload(
      { ...base, questions: [], ai_draft_questions: null },
      { questions: AI_DRAFT }
    );

    expect(payload.ai_draft_questions).toEqual(AI_DRAFT);
    expect(typeof payload.ai_draft_generated_at).toBe("string");
  });

  it("(ii)(iii) 이미 초안이 있으면 다시는 보내지 않는다", async () => {
    const stored = {
      ...base,
      questions: AI_DRAFT,
      ai_draft_questions: AI_DRAFT,
      ai_draft_generated_at: "2026-08-11T00:00:00.000Z",
    };
    const before = JSON.stringify(stored.ai_draft_questions);

    const payload = await captureAssignmentPayload(stored, { questions: INSTRUCTOR_EDIT });

    expect(payload).not.toHaveProperty("ai_draft_questions");
    expect(payload).not.toHaveProperty("ai_draft_generated_at");
    expect(JSON.stringify(applyUpdate(stored, payload).ai_draft_questions)).toBe(before);
  });
});
