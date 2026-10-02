import type { RubricItem } from "@/lib/types/exam";

/**
 * 학생 응시 화면에 보여 줄 평가 기준 항목을 고른다.
 *
 * 서버가 이미 `rubric_public` 이 true 일 때만 rubric 을 내려 주지만, 화면도 같은
 * 조건을 한 번 더 확인한다 — 이 화면이 비공개 기준을 우연히 그려서는 안 된다.
 *
 * `exams.rubric` 은 jsonb 라 모양을 믿을 수 없다. 과거 데모 템플릿은 배열이 아니라
 * 문자열이다. 배열이 아니거나 쓸 만한 항목이 하나도 없으면 빈 배열을 돌려주고,
 * 호출하는 쪽은 "빈 배열이면 버튼을 그리지 않는다" 한 가지만 알면 된다.
 */
export function getPublicRubricItems(rubric: unknown, rubricPublic: unknown): RubricItem[] {
  if (rubricPublic !== true) return [];
  if (!Array.isArray(rubric)) return [];

  const items: RubricItem[] = [];
  for (const entry of rubric) {
    if (!entry || typeof entry !== "object") continue;
    const { id, evaluationArea, detailedCriteria } = entry as Record<string, unknown>;
    const area = typeof evaluationArea === "string" ? evaluationArea : "";
    const criteria = typeof detailedCriteria === "string" ? detailedCriteria : "";
    if (!area.trim() && !criteria.trim()) continue;
    items.push({
      ...(typeof id === "string" ? { id } : {}),
      evaluationArea: area,
      detailedCriteria: criteria,
    });
  }
  return items;
}
