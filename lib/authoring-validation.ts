/**
 * 출제(authoring) 폼 공용 검증 헬퍼.
 *
 * exam/assignment의 생성(new)·수정(edit) 페이지가 동일한 문항 검증 로직을
 * 복사-붙여넣기로 중복 보유하던 것을 단일 소스로 통합한 모듈이다.
 * (과거 `app/(app)/instructor/[examId]/edit/page.tsx`에 "new/page.tsx와 동일"
 *  이라고 명시된 복붙 헬퍼가 drift를 일으켰다 → 구조적으로 제거.)
 *
 * 거울 페이지는 반드시 이 모듈에서 import 한다. 같은 이름의 로컬 헬퍼를
 * 다시 선언하면 `__tests__/mirror-drift.test.ts`가 실패한다.
 */

/** 객관식/OX 검증에 필요한 최소 구조 타입. 컴포넌트 타입 import를 피한다. */
export interface ObjectiveQuestionLike {
  type: string;
  options?: string[];
  correctOptionIndex?: number;
}

/** 리치텍스트 문항 본문이 (HTML 태그·&nbsp;·공백을 제거하면) 비어있는지 검사. */
export function isQuestionContentEmpty(text: string): boolean {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

/** 객관식/OX 문제의 선택지·정답이 덜 채워졌는지 검사한다. */
export function isObjectiveQuestionIncomplete(q: ObjectiveQuestionLike): boolean {
  if (q.type !== "multiple-choice" && q.type !== "true-false") return false;
  if (typeof q.correctOptionIndex !== "number") return true;
  if (q.type === "multiple-choice") {
    const opts = q.options ?? [];
    if (opts.length < 4) return true;
    return opts.slice(0, 4).some((o) => o.trim() === "");
  }
  return false;
}

/** 시험 최소 시간(분). 0은 무제한을 의미한다. */
export const EXAM_DURATION_MIN_MINUTES = 15;

/** 무제한(0)이 아니면서 최소 시간 미만이면 true. */
export function isExamDurationTooShort(durationMinutes: number): boolean {
  return durationMinutes !== 0 && durationMinutes < EXAM_DURATION_MIN_MINUTES;
}

/**
 * 거울 페이지(exam new/edit) 공용 duration 검증 사유 메시지(단일 소스).
 * 과거 new/edit가 서로 다른 문구를 들고 있어 drift가 났다 → 한 곳에서 관리.
 */
export const EXAM_DURATION_REASON =
  "시험 시간은 15분 이상이거나 무제한이어야 합니다";
