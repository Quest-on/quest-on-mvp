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
 *  - formatPickedQACriteria: formats Q&A pairs collected via quick-reply chips
 *    into an appendable criteria block.
 */

export type SendModeState = {
  committed: boolean;
  isGrading: boolean;
  gradingDone: boolean;
  gradingFailed: boolean;
  regradeArmed: boolean;
};

export type SendMode = "start" | "discuss";

/**
 * Truth table (evaluated in this order):
 *  - committed              → "discuss"
 *  - isGrading              → "discuss"
 *  - regradeArmed           → "start"
 *  - gradingDone || gradingFailed (and !regradeArmed) → "discuss"
 *  - else (no run yet)      → "start"
 */
export function resolveSendMode(state: SendModeState): SendMode {
  if (state.committed) return "discuss";
  if (state.isGrading) return "discuss";
  if (state.regradeArmed) return "start";
  if (state.gradingDone || state.gradingFailed) return "discuss";
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
 * precedes any user turn). The result is used to cap the interview at 3
 * AI questions before forcing a re-grade.
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
 * Formats Q&A pairs collected via quick-reply chips into an appendable
 * criteria block.
 *
 * NOTE: This is the SINGLE place where pickedQA is appended to criteria.
 * The re-grade arm path keeps `draft = base only` so that startGradingMutation
 * can call this function exactly once at send time — no double-appending.
 *
 * Returns "" when picks is empty so callers can do `base + formatPickedQACriteria(picks)`
 * without conditionals.
 */
export function formatPickedQACriteria(
  picks: { q: string; a: string }[],
): string {
  if (picks.length === 0) return "";
  const body = picks.map((p) => `Q: ${p.q}\nA: ${p.a}`).join("\n\n");
  return `\n\n---\n추가 기준 (채팅 Q&A에서 도출):\n${body}`;
}
