/**
 * Pure helpers for mapping keyboard digit keys to MCQ/OX option values.
 *
 * Mirrors the display-order logic in ObjectiveAnswerPanel.tsx (lines 38-43):
 *   - For multiple-choice: use displayOrder when it is defined AND its length
 *     equals optionCount; otherwise fall back to identity [0..optionCount-1].
 *   - For true-false: always identity [0, 1] regardless of displayOrder.
 *
 * The saved value is always the ORIGINAL option index as a string (e.g. "2"),
 * never the display position — matching onChange(String(originalIndex)) in the panel.
 */

/**
 * Returns the display→original-index mapping array for a question.
 *
 * @param type         Question type string ("multiple-choice", "true-false", …)
 * @param optionCount  Number of options (resolvedOptions.length in the panel)
 * @param displayOrder Optional shuffled order from seededOptionOrder()
 * @returns            Array where result[displayPos] === originalIndex
 */
export function resolveObjectiveOrder(
  type: string,
  optionCount: number,
  displayOrder?: number[],
): number[] {
  if (
    type !== "true-false" &&
    displayOrder !== undefined &&
    displayOrder.length === optionCount
  ) {
    return displayOrder;
  }
  return Array.from({ length: optionCount }, (_, i) => i);
}

/**
 * Converts a keyboard key press to the original option-index string to save.
 *
 * @param key    KeyboardEvent.key value (e.g. "1", "2", …, "a", "Enter")
 * @param params Question parameters (same shape as the panel props)
 * @returns      String original index ("0", "1", …) or null if not applicable
 */
export function objectiveKeyToOptionValue(
  key: string,
  params: {
    type: string;
    optionCount: number;
    displayOrder?: number[];
  },
): string | null {
  // Must be exactly one digit character "1".."9"
  if (!/^[1-9]$/.test(key)) return null;

  const pos = Number(key) - 1; // 0-based display position
  if (pos < 0 || pos >= params.optionCount) return null;

  const order = resolveObjectiveOrder(
    params.type,
    params.optionCount,
    params.displayOrder,
  );
  const original = order[pos];

  return Number.isInteger(original) ? String(original) : null;
}
