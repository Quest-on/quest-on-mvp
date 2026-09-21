/**
 * Pure (React-free) helpers for the bulk-grade conversation panel.
 *
 * Extracted for unit testability:
 *  - resolveSendMode: decides whether the composer's Send starts grading or
 *    discusses (the /start route returns 409 when committed/active AND wipes
 *    proposed_grades, so we must NEVER route there accidentally; /chat accepts
 *    messages in every state).
 *  - orderThreadItems: timeline ordering so post-result discussion stays below
 *    the result card and the conversation reads as an honest timeline.
 *  - isNearBottom: stick-to-bottom detection for the single scroll area.
 *  - countInterviewQuestions: counts AI questions posed AFTER the first user
 *    turn (excludes the welcome/init assistant message).
 *  - MIN_BULK_GRADE_INTERVIEW_QUESTIONS: minimum Q&A rounds before "proceed to grade".
 *  - buildCriteriaText: 서버로 보낼 criteriaText — 강사가 타이핑한 재채점 지시만
 *    담는다. 인터뷰 답변은 채팅에 있고 서버가 거기서 읽는다 (이슈 #426).
 */

/** Minimum AI↔instructor Q&A rounds before the instructor may skip to grading. */
export const MIN_BULK_GRADE_INTERVIEW_QUESTIONS = 5;

export type SendModeState = {
  committed: boolean;
  isGrading: boolean;
  gradingDone: boolean;
  gradingFailed: boolean;
  regradeArmed: boolean;
  /** Criteria interview finished and score range confirmed */
  interviewReady: boolean;
};

export type SendMode = "start" | "discuss";

/**
 * Truth table (evaluated in this order):
 *  - committed              → "discuss"
 *  - isGrading              → "discuss"
 *  - regradeArmed           → "start"
 *  - gradingDone || gradingFailed (and !regradeArmed) → "discuss"
 *  - !interviewReady        → "discuss" (AI-led interview phase)
 *  - else                   → "start"
 */
export function resolveSendMode(state: SendModeState): SendMode {
  if (state.committed) return "discuss";
  if (state.isGrading) return "discuss";
  if (state.regradeArmed) return "start";
  if (state.gradingDone || state.gradingFailed) return "discuss";
  if (!state.interviewReady) return "discuss";
  return "start";
}

/**
 * Stable sort by `ts` ascending, tie-broken by an explicit `seq` (also
 * ascending). Items without a `seq` sort before items with one at the same
 * timestamp, then keep their input order (stable).
 */
export function orderThreadItems<T extends { ts: number; seq?: number }>(
  items: T[],
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.ts !== b.item.ts) return a.item.ts - b.item.ts;
      const seqA = a.item.seq ?? Number.NEGATIVE_INFINITY;
      const seqB = b.item.seq ?? Number.NEGATIVE_INFINITY;
      if (seqA !== seqB) return seqA - seqB;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/**
 * True when a scroll position is within `threshold` px of the bottom.
 * Used to decide whether to auto-stick to the newest item.
 */
export function isNearBottom(
  metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
  threshold = 48,
): boolean {
  const { scrollTop, scrollHeight, clientHeight } = metrics;
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

/**
 * Counts the number of assistant messages that appear AFTER the first user
 * message in the conversation.
 *
 * This intentionally excludes the init/welcome assistant message (which
 * precedes any user turn). Used to gate the "proceed to grading" button.
 */
export function countInterviewQuestions(
  messages: { role: "user" | "assistant"; content: string }[],
): number {
  let firstUserIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") {
      firstUserIdx = i;
      break;
    }
  }
  if (firstUserIdx === -1) return 0;

  let count = 0;
  for (let i = firstUserIdx + 1; i < messages.length; i++) {
    if (messages[i].role === "assistant") count++;
  }
  return count;
}

/**
 * 서버로 보낼 `criteriaText` 를 만든다.
 *
 * **강사가 직접 타이핑한 재채점 지시만 담는다.** 인터뷰 답변은 — 선택지 칩으로
 * 고른 것이든 직접 쓴 것이든 — 이미 `bulk_grading_messages` 에 남아 있고,
 * 서버가 `extractGradingCriteriaFromChat` 으로 거기서 읽는다.
 *
 * 예전에는 칩으로 고른 Q&A 를 여기에 덧붙였다. 그런데 서버는 `criteriaText` 가
 * 비어 있지 않으면 대화 추출을 건너뛰고 조기 반환하므로, 칩을 한 번이라도 누르면
 * **나머지 인터뷰와 강사가 확정한 score_range 가 통째로 버려졌다** (이슈 #426).
 * 같은 인터뷰인데 입력 방식에 따라 결과가 갈렸고, 강사는 그 구분을 알 수 없었다.
 */
export function buildCriteriaText(input: {
  regradeArmed: boolean;
  criteriaMode: string;
  draft: string;
}): string {
  if (!input.regradeArmed || input.criteriaMode === "ai_default") return "";
  return input.draft.trim().slice(0, 8000);
}
