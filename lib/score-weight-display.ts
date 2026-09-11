/**
 * 배점 비중의 **표시용** 파생값 (#224)
 *
 * 채점은 weight 를 절대 배점이 아니라 상대 비중으로 쓴다.
 *
 *   최종점수 = SUM( 유형평균 x weight / totalConfiguredWeight )   (lib/grade-utils.ts)
 *
 * 화면도 같은 분모를 써야 한다. 예전에는 `weight / count` 로 절대 배점처럼
 * 보여줘서, 총합이 100 일 때만 우연히 맞고 벗어나면 거짓말했다.
 *   30/20 (합 50)    화면 10.0점  <-> 실제 20.0점
 *   100/100 (합 200) 화면 33.3점  <-> 실제 16.7점
 *
 * 이 파일이 따로 있는 이유: 컴포넌트 안에 두면 테스트가 산식을 **복제**하게
 * 되고, 그러면 컴포넌트를 되돌려도 테스트가 통과한다(실제로 레드팀이 그걸
 * 증명했다). 순수 함수로 빼서 컴포넌트와 테스트가 같은 구현을 쓰게 한다.
 *
 * 채점 로직은 건드리지 않는다. 정규화는 원래 맞고 표시만 틀렸다.
 */

/**
 * 이 유형이 최종 점수에서 차지하는 비율 (0~1).
 *
 * 총합이 0 이면 0 이다 — 0 으로 나누지 않는다.
 */
export function scoreShare(weight: number, totalWeight: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(totalWeight)) return 0;
  if (totalWeight <= 0) return 0;
  return weight / totalWeight;
}

/**
 * 100점 만점 기준 문항당 점수.
 *
 * 문항이 없으면 `null` 이다 — 나눌 대상이 없다는 뜻이고, 0 점과 구별해야 한다.
 *
 * 불변: `perQuestionScore(w, total, n) * n === scoreShare(w, total) * 100`
 * 즉 문항당 점수를 문항 수만큼 더하면 그 유형의 최종 점수 몫이 된다.
 */
export function perQuestionScore(
  weight: number,
  totalWeight: number,
  count: number
): number | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return (scoreShare(weight, totalWeight) * 100) / count;
}
