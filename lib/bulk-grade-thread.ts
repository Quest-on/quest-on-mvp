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
