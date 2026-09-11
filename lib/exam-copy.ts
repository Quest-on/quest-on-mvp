import { normalizeScoreWeights } from "@/lib/grade-utils";

/** 복사 대상(원본) 시험/과제에서 페이로드 생성에 필요한 필드들. */
export interface CopyableExamSource {
  title: string;
  description?: string | null;
  duration?: number | null;
  questions?: unknown;
  materials?: unknown;
  materials_text?: unknown;
  rubric?: unknown;
  rubric_public?: boolean | null;
  chat_weight?: number | null;
  score_weights?: unknown;
  language?: string | null;
  // 과제 정체성 필드 — 복사본이 과제로 남으려면 반드시 보존해야 한다.
  type?: string | null;
  assignment_prompt?: string | null;
  initial_state?: unknown;
  canvas_config?: unknown;
}

export interface BuildCopiedExamPayloadOptions {
  code: string;
  instructorId: string;
  now: string;
}

/**
 * 시험/과제 "복사본"의 exams insert 페이로드를 만든다.
 *
 * 핵심 불변식: 원본의 `type`(및 과제 정체성 필드 assignment_prompt/initial_state/canvas_config)을
 * 보존해야 한다. 이게 빠지면 과제 복사본이 DB 기본값(시험)으로 생성되고, 대시보드 편집 라우팅이
 * `type !== "exam"` 분기를 타지 못해 시험 편집기로 잘못 이동한다.
 *
 * deadline/close_at은 의도적으로 복사하지 않는다 — 복사본은 draft로 시작하며,
 * 과거 마감을 그대로 복제하면 생성 즉시 마감된 복사본이 만들어진다. 강사가 새로 설정한다.
 */
export function buildCopiedExamPayload(
  source: CopyableExamSource,
  options: BuildCopiedExamPayloadOptions,
) {
  const sanitizedQuestions = Array.isArray(source.questions)
    ? source.questions.map((q) => {
        const rest = { ...(q as Record<string, unknown>) };
        delete rest.core_ability;
        return rest;
      })
    : [];

  return {
    title: `${source.title} (복사본)`,
    code: options.code,
    description: source.description ?? null,
    duration: source.duration ?? 0,
    questions: sanitizedQuestions,
    materials: source.materials ?? [],
    materials_text: source.materials_text ?? [],
    rubric: source.rubric ?? [],
    rubric_public: source.rubric_public ?? false,
    chat_weight: source.chat_weight ?? null,
    score_weights: normalizeScoreWeights(source.score_weights),
    status: "draft", // 복사본은 초안 상태로 시작
    instructor_id: options.instructorId,
    created_at: options.now,
    updated_at: options.now,
    language: source.language === "en" ? "en" : "ko",
    // ── 과제 정체성 보존 (이 줄들이 빠지면 과제→시험 버그 재발) ──
    type: source.type ?? null,
    assignment_prompt: source.assignment_prompt ?? null,
    initial_state: source.initial_state ?? {},
    canvas_config: source.canvas_config ?? {},
  };
}
