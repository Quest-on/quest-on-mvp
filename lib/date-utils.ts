/**
 * KST(UTC+9) 날짜 유틸리티 — 순수 함수, 사이드이펙트 없음.
 */

/**
 * ISO datetime 문자열을 KST 기준 "YYYY-MM-DD" 문자열로 변환.
 * ExamInfoForm의 deadline 입력과 create 페이지의 변환 로직과 짝을 이룸.
 *
 * @example
 * isoToKSTDateString("2026-06-10T14:59:00.000Z") // "2026-06-10" (KST: 23:59)
 * isoToKSTDateString(null) // ""
 * isoToKSTDateString("invalid") // ""
 */
export function isoToKSTDateString(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
