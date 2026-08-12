/**
 * 교수 메시지의 입력 출처(input_origin).
 *
 * role='user' 는 저자를 뜻하지 않는다. quick-reply 보기는 AI가 학생 답안을 근거로
 * 생성한 문장이고 교수는 클릭만 한다. 저장된 행에서 그 둘을 구분하려고 이 값을 남긴다.
 *
 * 이 값은 "클라이언트가 보고한 힌트"이지 인증된 사실이 아니다. 클라이언트는 무엇이든
 * 보낼 수 있으므로, 서버는 아래 어휘에 정확히 일치할 때만 저장하고 그 외에는 전부
 * NULL 로 떨어뜨린다. 심층 방어이지 인증 수단이 아니다.
 *
 * 어휘는 database/031_input_origin.sql 의 CHECK 제약과 1:1로 맞춘다.
 * ('derived' 는 추출 결과의 출처이지 원본 메시지의 출처가 아니라서 여기 없다.)
 */
export const INPUT_ORIGINS = [
  "typed",
  "quick_reply",
  "pasted",
  "imported",
] as const;

export type InputOrigin = (typeof INPUT_ORIGINS)[number];

const INPUT_ORIGIN_SET: ReadonlySet<string> = new Set<string>(INPUT_ORIGINS);

/**
 * 신고된 출처를 어휘에 대조한다. 일치하지 않으면 무조건 null.
 *
 * null 은 "타이핑이 아님"이 아니라 "출처 미상"이다. 소비 측은 null 을 'typed' 로
 * 승격시켜서는 안 된다 — 그 순간 위조 값이 교수 저작으로 세탁된다.
 */
export function normalizeInputOrigin(value: unknown): InputOrigin | null {
  if (typeof value !== "string") return null;
  return INPUT_ORIGIN_SET.has(value) ? (value as InputOrigin) : null;
}

/**
 * 교수 메시지 행에 검증된 input_origin 을 붙인다.
 *
 * 라우트가 DB로 보내는 행은 반드시 이 함수를 통과한다. 클라이언트 문자열이
 * 행 객체에 그대로 실리는 경로를 하나로 좁혀 두기 위한 것이다.
 */
export function withInputOrigin<T extends Record<string, unknown>>(
  row: T,
  reportedOrigin: unknown,
): T & { input_origin: InputOrigin | null } {
  return { ...row, input_origin: normalizeInputOrigin(reportedOrigin) };
}
