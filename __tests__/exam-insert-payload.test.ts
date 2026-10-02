import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));

// createExam 이 공용 빌더를 실제로 부르는지 본다. 구현은 그대로 통과시키고 호출만 기록한다.
vi.mock("@/lib/exam-insert-payload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/exam-insert-payload")>();
  return { ...actual, buildExamInsertPayload: vi.fn(actual.buildExamInsertPayload) };
});

import { createExam } from "@/app/api/supa/handlers/exam-handlers";
import {
  buildExamInsertPayload,
  EXAM_CODE_ALPHABET,
  EXAM_CODE_LENGTH,
  generateExamCode,
  type ExamInsertInput,
} from "@/lib/exam-insert-payload";
import {
  buildDefaultScoreWeightsForQuestionTypes,
  normalizeScoreWeights,
  validateScoreWeightsForQuestions,
  type ScoreWeights,
} from "@/lib/grade-utils";

/**
 * 시험 생성 페이로드 공용 빌더 (#513).
 *
 * `createExam` 의 exams 행 구성부를 순수 함수로 뽑아 createExam 과 모의시험 시드 스크립트가
 * 한 코드를 쓰게 했다. 단일 출처가 목적이라, 추출 때문에 createExam 이 DB 에 보내는 값이
 * 달라지면 안 된다. 그걸 아래 "동등성" 이 입력 수백 개로 확인한다.
 */

const INSTRUCTOR_ID = "instructor-1";
const EXAM_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-10-03T00:00:00.000Z";

// ─────────────────────────────────────────────────────────────────────────────
// 추출 전 createExam 의 페이로드 구성 로직 - b8287303 의 exam-handlers.ts 를 그대로 옮겼다.
//
// 이 함수는 **고치지 않는다.** 빌더가 이것과 달라지면 그게 회귀다. (유일한 변경: 응답 객체를
// 만들던 errorJson(...) 호출을 같은 인자를 담은 값으로 바꿨다.)
// ─────────────────────────────────────────────────────────────────────────────
type LegacyQuestion = {
  id: string;
  text: string;
  type: "multiple-choice" | "essay" | "short-answer";
  options?: string[];
  core_ability?: unknown;
};

type LegacyData = {
  title: string;
  duration: number;
  questions: LegacyQuestion[];
  materials?: string[];
  materials_text?: Array<{ url: string; text: string; fileName: string }>;
  chat_weight?: number | null;
  score_weights?: ScoreWeights | null;
  course_id?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  type?: string;
  assignment_prompt?: string | null;
  rubric?: string | null;
  is_demo?: boolean;
};

type LegacyResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; message: string; details?: { errors: string[] } };

function legacyBuild(data: LegacyData, userId: string, examCode: string): LegacyResult {
  const sanitizedQuestions = (data.questions || []).map((q) => {
    const rest = { ...q } as LegacyQuestion & { core_ability?: unknown };
    delete rest.core_ability;
    return rest;
  });
  const normalizedScoreWeights = normalizeScoreWeights(data.score_weights);
  if (data.score_weights !== null && data.score_weights !== undefined && !normalizedScoreWeights) {
    return { ok: false, message: "유효하지 않은 점수 배점입니다." };
  }
  const scoreWeights =
    normalizedScoreWeights ??
    buildDefaultScoreWeightsForQuestionTypes(sanitizedQuestions.map((q) => q.type));
  const scoreWeightErrors = validateScoreWeightsForQuestions(
    scoreWeights,
    sanitizedQuestions.map((q) => q.type)
  );
  if (scoreWeightErrors.length > 0) {
    return { ok: false, message: scoreWeightErrors[0], details: { errors: scoreWeightErrors } };
  }

  const examData: Record<string, unknown> = {
    title: data.title,
    code: examCode,
    description: null,
    duration: data.duration,
    questions: sanitizedQuestions,
    materials: data.materials || [],
    materials_text: data.materials_text || [],
    chat_weight: data.chat_weight ?? null,
    score_weights: scoreWeights,
    status: data.status,
    instructor_id: userId,
    created_at: data.created_at,
    updated_at: data.updated_at,
    ...(data.type ? { type: data.type } : {}),
    ...(data.assignment_prompt ? { assignment_prompt: data.assignment_prompt } : {}),
    ...(data.rubric ? { rubric: data.rubric } : {}),
    ...(data.course_id !== undefined ? { course_id: data.course_id } : {}),
    ...(data.is_demo ? { is_demo: true } : {}),
  };
  return { ok: true, payload: examData };
}

// ─────────────────────────────────────────────────────────────────────────────
// 입력 격자: 각 축의 변형을 곱해 한 건씩 비교한다.
// ─────────────────────────────────────────────────────────────────────────────
const ESSAY: LegacyQuestion = { id: "q1", text: "서술하시오.", type: "essay" };
const MCQ: LegacyQuestion = {
  id: "q2",
  text: "고르시오.",
  type: "multiple-choice",
  options: ["a", "b", "c", "d"],
};

const questionVariants: Array<[string, LegacyQuestion[]]> = [
  ["문항 없음", []],
  ["서술형만", [ESSAY]],
  ["서술형 5개", [1, 2, 3, 4, 5].map((n) => ({ id: `q${n}`, text: `문항 ${n}`, type: "essay" as const }))],
  ["객관식+서술형", [MCQ, ESSAY]],
  ["core_ability 가 붙은 문항", [{ ...ESSAY, core_ability: "분석력" }, { ...MCQ, core_ability: ["a", "b"] }]],
  [
    "ai_role 이 붙은 문항",
    [
      { ...ESSAY, ai_role: "analysis_partner" },
      { ...ESSAY, id: "q9", ai_role: "case_author", core_ability: "분석력" },
    ],
  ],
];

const validMixedWeights: ScoreWeights = {
  version: 1,
  distribution: "equal_by_type",
  typeWeights: { "multiple-choice": 60, case: 40 },
};

const scoreWeightVariants: Array<[string, ScoreWeights | null | undefined]> = [
  ["undefined", undefined],
  ["null", null],
  ["객관식+서술형 60/40", validMixedWeights],
  ["서술형만 100", { version: 1, distribution: "equal_by_type", typeWeights: { case: 100 } }],
  ["모양이 틀림", { version: 2 } as unknown as ScoreWeights],
  ["유형 불일치", { version: 1, distribution: "equal_by_type", typeWeights: { "true-false": 50 } }],
];

const chatWeightVariants: Array<[string, number | null | undefined]> = [
  ["undefined", undefined],
  ["null", null],
  ["0", 0],
  ["50", 50],
  ["100", 100],
];

const extraVariants: Array<[string, Partial<LegacyData>]> = [
  ["부가 없음", {}],
  ["type=assignment", { type: "assignment" }],
  ["type 빈 문자열", { type: "" }],
  ["assignment_prompt", { assignment_prompt: "과제 설명" }],
  ["assignment_prompt null", { assignment_prompt: null }],
  ["rubric 문자열", { rubric: "평가 기준" }],
  ["rubric 빈 문자열", { rubric: "" }],
  ["rubric null", { rubric: null }],
  ["course_id uuid", { course_id: "33333333-3333-4333-8333-333333333333" }],
  ["course_id null", { course_id: null }],
  ["is_demo true", { is_demo: true }],
  ["is_demo false", { is_demo: false }],
  [
    "자료 있음",
    {
      materials: ["https://files.test/a.pdf"],
      materials_text: [{ url: "https://files.test/a.pdf", text: "본문", fileName: "a.pdf" }],
    },
  ],
  ["duration 0", { duration: 0 }],
];

function inputFor(
  questions: LegacyQuestion[],
  score_weights: ScoreWeights | null | undefined,
  chat_weight: number | null | undefined,
  extra: Partial<LegacyData>
): LegacyData {
  return {
    title: "동등성 시험",
    duration: 60,
    questions,
    status: "draft",
    created_at: NOW,
    updated_at: NOW,
    score_weights,
    chat_weight,
    ...extra,
  };
}

function toBuilderInput(data: LegacyData, code: string): ExamInsertInput<LegacyQuestion> {
  return { ...data, code, instructor_id: INSTRUCTOR_ID };
}

describe("동등성: 공용 빌더 == 추출 전 createExam 로직", () => {
  const cases: Array<{ name: string; data: LegacyData }> = [];
  for (const [qn, qs] of questionVariants) {
    for (const [sn, sw] of scoreWeightVariants) {
      for (const [cn, cw] of chatWeightVariants) {
        for (const [en, extra] of extraVariants) {
          cases.push({
            name: `${qn} / 배점 ${sn} / chat_weight ${cn} / ${en}`,
            data: inputFor(qs, sw, cw, extra),
          });
        }
      }
    }
  }

  it("격자가 충분히 넓다 (축 하나가 조용히 비면 아래 단언이 공허해진다)", () => {
    expect(cases.length).toBe(
      questionVariants.length * scoreWeightVariants.length * chatWeightVariants.length * extraVariants.length
    );
    expect(cases.length).toBeGreaterThan(400);
  });

  it("모든 입력에서 출력(성공 페이로드 또는 400 사유)이 같다", () => {
    const mismatches: string[] = [];
    let okCount = 0;
    let errCount = 0;
    for (const { name, data } of cases) {
      const legacy = legacyBuild(data, INSTRUCTOR_ID, "ABC123");
      const built = buildExamInsertPayload(toBuilderInput(data, "ABC123"));
      if (legacy.ok) okCount++;
      else errCount++;
      try {
        expect(built).toEqual(legacy);
        if (legacy.ok && built.ok) {
          // toEqual 은 키 순서를 보지 않는다. 직렬화 결과도 같아야 DB 로 가는 JSON 이 같다.
          expect(JSON.stringify(built.payload)).toBe(JSON.stringify(legacy.payload));
        }
      } catch {
        mismatches.push(name);
      }
    }
    expect(mismatches).toEqual([]);
    // 성공과 실패가 둘 다 격자에 실제로 들어 있다.
    expect(okCount).toBeGreaterThan(0);
    expect(errCount).toBeGreaterThan(0);
  });

  it("호출자의 입력을 바꾸지 않는다 (core_ability 제거는 복사본에서)", () => {
    const questions = [{ ...ESSAY, core_ability: "분석력" }];
    const data = inputFor(questions, undefined, undefined, {});
    const before = JSON.stringify(data);

    const built = buildExamInsertPayload(toBuilderInput(data, "ABC123"));

    expect(JSON.stringify(data)).toBe(before);
    expect(built.ok && (built.payload.questions as unknown[])[0]).not.toHaveProperty("core_ability");
    expect(questions[0]).toHaveProperty("core_ability", "분석력");
  });
});

describe("빌더 계약", () => {
  const mockExam: ExamInsertInput = {
    title: "모의시험 (합성)",
    code: "ABC123",
    duration: 0,
    questions: [
      { id: "q1", text: "첫 번째 질문", type: "essay" },
      { id: "q2", text: "두 번째 질문", type: "essay" },
    ],
    materials: [],
    materials_text: [],
    chat_weight: null,
    status: "draft",
    instructor_id: INSTRUCTOR_ID,
    created_at: NOW,
    updated_at: NOW,
    rubric: [{ evaluationArea: "영역", detailedCriteria: "기준" }],
    rubric_public: true,
    language: "ko",
  };

  it("모의시험 값 전체: 서술형만 있으면 score_weights 는 case 100 이다", () => {
    const built = buildExamInsertPayload(mockExam);

    expect(built).toEqual({
      ok: true,
      payload: {
        title: "모의시험 (합성)",
        code: "ABC123",
        description: null,
        duration: 0,
        questions: [
          { id: "q1", text: "첫 번째 질문", type: "essay" },
          { id: "q2", text: "두 번째 질문", type: "essay" },
        ],
        materials: [],
        materials_text: [],
        chat_weight: null,
        score_weights: { version: 1, typeWeights: { case: 100 }, distribution: "equal_by_type" },
        status: "draft",
        instructor_id: INSTRUCTOR_ID,
        created_at: NOW,
        updated_at: NOW,
        rubric: [{ evaluationArea: "영역", detailedCriteria: "기준" }],
        rubric_public: true,
        language: "ko",
      },
    });
  });

  it("문항 정제는 core_ability 만 지운다 - ai_role 같은 나머지 문항 필드는 그대로 남는다 (#519)", () => {
    const built = buildExamInsertPayload({
      ...mockExam,
      questions: [
        { id: "q1", text: "분석", type: "essay", ai_role: "analysis_partner", core_ability: "분석력" },
        { id: "q2", text: "사례", type: "essay", ai_role: "case_author" },
        { id: "q3", text: "기본", type: "essay" },
      ],
    });

    expect(built.ok && built.payload.questions).toEqual([
      { id: "q1", text: "분석", type: "essay", ai_role: "analysis_partner" },
      { id: "q2", text: "사례", type: "essay", ai_role: "case_author" },
      { id: "q3", text: "기본", type: "essay" },
    ]);
    // 값이 없는 문항에 ai_role: undefined 같은 키를 만들어 넣지도 않는다.
    expect(built.ok && (built.payload.questions as object[])[2]).not.toHaveProperty("ai_role");
  });

  it("rubric 은 배열 그대로 실린다 (문자열로 바꾸지 않는다)", () => {
    const built = buildExamInsertPayload(mockExam);

    expect(built.ok && Array.isArray(built.payload.rubric)).toBe(true);
  });

  it("rubric_public 은 false 도 그대로 싣는다 - 값이 없을 때만 키를 뺀다", () => {
    const off = buildExamInsertPayload({ ...mockExam, rubric_public: false });
    const unset = buildExamInsertPayload({ ...mockExam, rubric_public: undefined });

    expect(off.ok && off.payload).toHaveProperty("rubric_public", false);
    expect(unset.ok && unset.payload).not.toHaveProperty("rubric_public");
  });

  it("language 는 호출자가 넘길 때만 싣는다", () => {
    const en = buildExamInsertPayload({ ...mockExam, language: "en" });
    const none = buildExamInsertPayload({ ...mockExam, language: undefined });

    expect(en.ok && en.payload).toHaveProperty("language", "en");
    expect(none.ok && none.payload).not.toHaveProperty("language");
  });

  it("입장 RPC·시작 라우트가 소유한 컬럼은 어떤 입력에서도 싣지 않는다", () => {
    const built = buildExamInsertPayload(mockExam);
    const keys = built.ok ? Object.keys(built.payload) : [];

    for (const owned of ["first_published_at", "student_count", "started_at", "open_at", "close_at"]) {
      expect(keys).not.toContain(owned);
    }
    expect(built.ok && built.payload.status).toBe("draft");
  });

  it("배점이 틀리면 ok:false 와 사유를 돌려주고 던지지 않는다", () => {
    const bad = buildExamInsertPayload({
      ...mockExam,
      score_weights: { version: 1, distribution: "equal_by_type", typeWeights: { "true-false": 10 } },
    });

    expect(bad).toEqual({
      ok: false,
      message: "문항이 없는 유형에는 비중을 설정할 수 없습니다.",
      details: {
        errors: [
          "문항이 없는 유형에는 비중을 설정할 수 없습니다.",
          "문항이 있는 유형에는 1점 이상의 비중을 설정해야 합니다.",
        ],
      },
    });
  });
});

describe("시험 코드 생성기", () => {
  afterEach(() => vi.restoreAllMocks());

  it("알파벳은 A-Z0-9 36자이고 길이는 6이다", () => {
    expect(EXAM_CODE_ALPHABET).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    expect(EXAM_CODE_LENGTH).toBe(6);
    expect(generateExamCode()).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("Math.random 이 0 이면 첫 글자, 1 에 가까우면 마지막 글자만 나온다", () => {
    const rand = vi.spyOn(Math, "random");
    rand.mockReturnValue(0);
    expect(generateExamCode()).toBe("AAAAAA");
    rand.mockReturnValue(0.999999);
    expect(generateExamCode()).toBe("999999");
  });
});

describe("createExam 은 공용 빌더로 exams 행을 만든다", () => {
  type QueryResult = { data: unknown; error: unknown };

  function createChain(result: QueryResult = { data: null, error: null }) {
    const inserted: Array<Record<string, unknown>> = [];
    const builder = {
      inserted,
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      insert: vi.fn((payload: unknown) => {
        inserted.push(structuredClone(payload) as Record<string, unknown>);
        return builder;
      }),
      update: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      single: vi.fn().mockResolvedValue(result),
      maybeSingle: vi.fn().mockResolvedValue(result),
      then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  }

  function mockCreate() {
    const exams = createChain();
    exams.single
      .mockResolvedValueOnce({ data: null, error: null }) // 코드 중복 사전 조회
      .mockResolvedValueOnce({ data: { id: EXAM_ID }, error: null }); // INSERT
    const nodes = createChain();
    nodes.single.mockResolvedValue({ data: { id: "node-1" }, error: null });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "exams") return exams;
      if (table === "exam_nodes") return nodes;
      throw new Error(`Unexpected table: ${table}`);
    });
    return exams;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
  });

  it("빌더를 한 번 부르고 로그인한 사용자를 instructor_id 로 넘긴다", async () => {
    mockCreate();

    const res = await createExam({
      title: "호출 확인",
      code: "ABC123",
      duration: 30,
      questions: [{ id: "q1", text: "서술", type: "essay" }],
      status: "draft",
      created_at: NOW,
      updated_at: NOW,
    });

    expect(res.status).toBe(200);
    expect(buildExamInsertPayload).toHaveBeenCalledTimes(1);
    expect(buildExamInsertPayload).toHaveBeenCalledWith(
      expect.objectContaining({ title: "호출 확인", code: "ABC123", instructor_id: INSTRUCTOR_ID })
    );
  });

  it("language 는 빌더에 넘기지 않는다 - 기존처럼 INSERT 뒤 UPDATE 로만 쓴다", async () => {
    mockCreate();

    await createExam({
      title: "언어",
      code: "ABC123",
      duration: 30,
      questions: [],
      status: "draft",
      created_at: NOW,
      updated_at: NOW,
      language: "en",
    });

    const arg = vi.mocked(buildExamInsertPayload).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(arg).not.toHaveProperty("language");
  });

  it("createExam 경로도 문항의 ai_role 을 INSERT 까지 보존한다 (#519)", async () => {
    const exams = mockCreate();

    const res = await createExam({
      title: "AI 역할",
      code: "ABC123",
      duration: 30,
      questions: [
        { id: "q1", text: "분석", type: "essay", ai_role: "analysis_partner", core_ability: "분석력" },
        { id: "q2", text: "기본", type: "essay" },
      ] as never,
      status: "draft",
      created_at: NOW,
      updated_at: NOW,
    });

    expect(res.status).toBe(200);
    expect(exams.inserted[0].questions).toEqual([
      { id: "q1", text: "분석", type: "essay", ai_role: "analysis_partner" },
      { id: "q2", text: "기본", type: "essay" },
    ]);
  });

  it("DB 로 가는 값이 추출 전 로직의 출력과 같다 (대표 입력)", async () => {
    const samples: LegacyData[] = [
      inputFor([ESSAY], undefined, undefined, {}),
      inputFor([MCQ, ESSAY], validMixedWeights, 70, { course_id: null }),
      inputFor([{ ...ESSAY, core_ability: "x" }], null, 0, { type: "assignment", assignment_prompt: "p", rubric: "r" }),
      inputFor([], undefined, 100, { is_demo: true, materials: ["u"], duration: 0 }),
    ];

    for (const data of samples) {
      vi.clearAllMocks();
      currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
      const exams = mockCreate();

      const res = await createExam({ ...data, code: "ABC123" });

      const legacy = legacyBuild(data, INSTRUCTOR_ID, "ABC123");
      expect(legacy.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(exams.inserted[0]).toEqual(legacy.ok ? legacy.payload : null);
      expect(JSON.stringify(exams.inserted[0])).toBe(JSON.stringify(legacy.ok ? legacy.payload : null));
    }
  });
});
