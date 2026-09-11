/**
 * 사람에게 닿는 유일한 창구. (이슈 #347)
 *
 * 무료 한도(발행 3회 / 시험당 학생 5명)를 푸는 방법은 메일이다. 자동 심사도
 * 결제도 없다 — 승인 게이트를 걷어낸 뒤(에픽 #79) 남은 예외 처리를 사람이
 * 직접 한다.
 *
 * 상수로 두는 이유: 이 주소가 랜딩 푸터·404·문의 버튼에 각각 하드코딩돼 있었다.
 * 한도 안내에도 적으면 다섯 번째가 된다. 주소가 바뀌는 날 네 곳은 고치고 한 곳은
 * 잊는다.
 *
 * 문구가 아니라 **식별자**이므로 next-intl 대상이 아니다. 화면에 보이는 문장은
 * 메시지에 두고 이 값을 파라미터로 넘긴다.
 */
export const SUPPORT_EMAIL = "questonkr@gmail.com";

/**
 * 제목을 채운 mailto 링크. 제목은 호출부가 번역된 문자열로 넘긴다.
 *
 * 본문은 채우지 않는다. 메일 클라이언트마다 줄바꿈 처리가 갈리고, 무엇보다
 * 무엇을 적어야 하는지는 화면에서 이미 말했다.
 */
export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
