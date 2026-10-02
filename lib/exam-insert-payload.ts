import {
  buildDefaultScoreWeightsForQuestionTypes,
  normalizeScoreWeights,
  validateScoreWeightsForQuestions,
  type ScoreWeights,
} from "./grade-utils";

/**
 * 시험 생성 `exams` 행 페이로드의 단일 출처 (#513).
 *
 * `createExam`(교수자 세션, `app/api/supa/handlers/exam-handlers.ts`)과 서비스 롤 시드
 * 스크립트(`scripts/seed-mock-exam.ts`)가 같은 규칙으로 행을 만들도록 뽑아냈다. 둘이 따로 구성하면
 * score_weights 기본값, chat_weight null 보존, 문항 정제 같은 불변식이 한쪽에서만 지켜진다.
 *
 * **순수 함수다.** DB·인증·시계를 건드리지 않는다. 호출자가 정해서 넘긴다:
 *   - 인증과 소유자 (`instructor_id`)
 *   - 코드 중복 확인을 마친 `code`
 *   - 시각 (`created_at`, `updated_at`)
 * 이 모듈에는 `exams` 조회가 없다 - `__tests__/demo-exclusion.test.ts` 의 조회 지점 레지스트리에
 * 새 파일을 만들지 않기 위해서이기도 하다.
 *
 * createExam 의 외부 동작은 이 추출로 바뀌면 안 된다. `__tests__/exam-insert-payload.test.ts` 가
 * 추출 전 로직의 사본과 입력 수백 개로 출력을 맞대어 본다.
 */

/** 시험 코드 알파벳. 헷갈리는 글자를 빼지 않은 36자 - 기존 createExam 과 같다. */
export const EXAM_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const EXAM_CODE_LENGTH = 6;

/** 6자 시험 코드. 중복 확인은 호출자가 한다 (사전 조회 + code UNIQUE 의 23505 재시도). */
export function generateExamCode(): string {
  let result = "";
  for (let i = 0; i < EXAM_CODE_LENGTH; i++) {
    result += EXAM_CODE_ALPHABET.charAt(Math.floor(Math.random() * EXAM_CODE_ALPHABET.length));
  }
  return result;
}

/**
 * 루브릭 항목. `lib/grading.ts` 의 `RubricItem` 과 같은 모양이다.
 * 채점은 `Array.isArray(exam.rubric)` 일 때만 읽고 문자열이면 조용히 무시한다.
 */
export interface ExamRubricItem {
  evaluationArea: string;
  detailedCriteria: string;
}

export interface ExamMaterialText {
  url: string;
  text: string;
  fileName: string;
}

/** 페이로드 구성에 필요한 문항의 최소 모양. 나머지 필드는 그대로 통과시킨다. */
export type ExamInsertQuestion = { type?: string | null; [key: string]: unknown };

export type ExamInsertInput<Q extends { type?: string | null } = ExamInsertQuestion> = {
  title: string;
  /** 중복 확인을 마친 코드. */
  code: string;
  duration: number;
  questions?: Q[] | null;
  materials?: string[];
  materials_text?: ExamMaterialText[];
  /** null 은 "교수자가 안 건드림". 숫자로 접지 않고 그대로 저장한다. */
  chat_weight?: number | null;
  score_weights?: ScoreWeights | null;
  course_id?: string | null;
  status: string;
  instructor_id: string;
  created_at: string;
  updated_at: string;
  /** `exams.type`. 기본은 시험(DB 기본값)이라 값이 있을 때만 싣는다. */
  type?: string;
  assignment_prompt?: string | null;
  /** 값이 있을 때만 싣는다. 시험 루브릭은 반드시 배열이어야 채점이 읽는다. */
  rubric?: string | ExamRubricItem[] | null;
  /** false 도 그대로 싣는다. `undefined` 일 때만 키를 뺀다 (DB 기본값 false). */
  rubric_public?: boolean;
  /**
   * INSERT 에 직접 싣는 호출자용(시드 스크립트, 시험 복사).
   * `createExam` 은 넘기지 않는다 - 기본 `ko` 는 DB 기본값에 맡기고 `en` 만 INSERT 뒤 UPDATE 로 쓴다.
   */
  language?: "ko" | "en";
  /**
   * 온보딩 데모. false 일 때 키를 아예 넣지 않는 이유: `is_demo` 는 018 마이그레이션이 추가한
   * 컬럼이라, 아직 적용되지 않은 DB 에서 일반 시험 생성까지 같이 죽는다.
   */
  is_demo?: boolean;
};

export type ExamInsertPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; message: string; details?: { errors: string[] } };

/**
 * `exams` INSERT 페이로드를 만든다.
 *
 * 점수 배점이 잘못됐으면 던지지 않고 `ok: false` 와 사유를 돌려준다. createExam 은 이를
 * `INVALID_SCORE_WEIGHTS` 400 으로 옮기고, 시드 스크립트는 중단 사유로 쓴다.
 */
export function buildExamInsertPayload<Q extends { type?: string | null }>(
  data: ExamInsertInput<Q>
): ExamInsertPayloadResult {
  // NOTE: core_ability(핵심 역량) 필드는 제거되었으므로 저장 시 항상 제거한다.
  const sanitizedQuestions = (data.questions || []).map((q) => {
    const rest = { ...q } as Q & { core_ability?: unknown };
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

  const payload: Record<string, unknown> = {
    title: data.title,
    code: data.code,
    description: null, // description 필드는 nullable이므로 null로 설정
    duration: data.duration,
    questions: sanitizedQuestions,
    materials: data.materials || [],
    materials_text: data.materials_text || [], // 추출된 텍스트 저장
    // null 은 "교수자가 안 건드림" 을 뜻한다. 여기서 50 으로 접으면 그 사실이
    // 사라져, 편집으로 다시 들어왔을 때 손대지 않은 시험도 사용자 지정으로
    // 보인다. 컬럼은 Int? 이고 DB 기본값이 50 이며, 채점은 lib/grading.ts:789
    // 에서 chat_weight ?? 50 으로 이미 방어하므로 null 을 그대로 보존한다.
    chat_weight: data.chat_weight ?? null,
    score_weights: scoreWeights,
    status: data.status,
    instructor_id: data.instructor_id, // Supabase Auth user ID
    created_at: data.created_at,
    updated_at: data.updated_at,
    ...(data.type ? { type: data.type } : {}),
    ...(data.assignment_prompt ? { assignment_prompt: data.assignment_prompt } : {}),
    ...(data.rubric ? { rubric: data.rubric } : {}),
    ...(data.rubric_public !== undefined ? { rubric_public: data.rubric_public } : {}),
    ...(data.course_id !== undefined ? { course_id: data.course_id } : {}),
    ...(data.language ? { language: data.language } : {}),
    ...(data.is_demo ? { is_demo: true } : {}),
  };

  return { ok: true, payload };
}
