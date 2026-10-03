/**
 * 시험 AI 역할 해석 (이슈 #519)
 *
 * 학생 시험 채팅 한 요청이 어떤 역할로 답할지를 문항 JSON 의 `ai_role` 에서 정한다. DDL 이 없다 —
 * 시험 단위 컬럼은 이번에 만들지 않는다.
 *
 *   - `ai_role === "analysis_partner"` 이면 분석 파트너.
 *   - 그 밖의 모든 것은 사례형 출제자(현행): 키 없음, 알 수 없는 문자열, 문자열이 아닌 값, 깨진 문항
 *     목록, 객체가 아닌 문항, 범위 밖 qIdx. 틀린 설정이 학생 시험을 막지 않고 현행 동작으로 떨어진다.
 *   - 값은 정확히 일치할 때만 인정한다. 대소문자나 공백을 너그럽게 읽지 않는다.
 *
 * v1 은 한국어만 지원한다. 시험 언어가 en 이면 분석 파트너를 골랐어도 사례형으로 폴백한다. 영어 본문이
 * 아직 없고, 영어 시험 학생에게 한국어 지시문이 가면 안 되기 때문이다.
 *
 * 시험 `type` 은 받지 않는다. 과제 계열은 `/api/assignment-chat` 이 따로 처리하고 이 함수를 쓰는
 * `/api/chat` 은 시험 채팅 전용이다(학생 화면의 `useExamChat` 만 호출한다).
 *
 * 이 모듈은 순수하다. I/O 가 없고 학생 메시지와 시각과 난수를 입력으로 받지 않는다.
 */

import {
  CURRENT_ANALYSIS_PARTNER_SPEC_ID,
  CURRENT_STUDENT_CHAT_SPEC_ID,
  type StudentChatSpecId,
} from "@/lib/student-chat-spec";

export const AI_ROLES = ["case_author", "analysis_partner"] as const;
export type AiRole = (typeof AI_ROLES)[number];

export type ResolvedExamAiProfile = Readonly<{
  role: AiRole;
  /** 이 역할이 실제로 쓰는 스펙. 레지스트리의 현재 포인터에서 온다. */
  specId: StudentChatSpecId;
}>;

export type ResolveExamAiProfileInput = {
  exam: {
    /** 시험 언어. en 이 아니면 ko 로 본다(빌더와 같은 규칙). */
    language?: string | null;
    /** `exams.questions` 원본 JSON. 서버가 로드한 값만 넘긴다. */
    questions?: unknown;
  };
  /** 문항 배열 위치(q_idx). */
  qIdx: number;
};

const CASE_AUTHOR: ResolvedExamAiProfile = Object.freeze({
  role: "case_author",
  specId: CURRENT_STUDENT_CHAT_SPEC_ID,
});

const ANALYSIS_PARTNER: ResolvedExamAiProfile = Object.freeze({
  role: "analysis_partner",
  specId: CURRENT_ANALYSIS_PARTNER_SPEC_ID,
});

/** 해당 문항의 ai_role 원본 값. 문항을 못 찾으면 undefined. 값을 해석하지 않는다. */
function readQuestionAiRole(questions: unknown, qIdx: number): unknown {
  if (!Array.isArray(questions)) return undefined;
  if (!Number.isInteger(qIdx) || qIdx < 0 || qIdx >= questions.length) return undefined;
  const question: unknown = questions[qIdx];
  if (!question || typeof question !== "object" || Array.isArray(question)) return undefined;
  return (question as { ai_role?: unknown }).ai_role;
}

export function resolveExamAiProfile(input: ResolveExamAiProfileInput): ResolvedExamAiProfile {
  const exam = input?.exam;
  if (!exam || typeof exam !== "object") return CASE_AUTHOR;

  if (readQuestionAiRole(exam.questions, input.qIdx) !== "analysis_partner") return CASE_AUTHOR;

  // v1 폴백: 영어 시험은 사례형. (영어 본문을 추가할 때 이 한 줄을 바꾼다.)
  if (exam.language === "en") return CASE_AUTHOR;

  return ANALYSIS_PARTNER;
}
