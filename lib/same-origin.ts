/**
 * 요청이 이 사이트의 페이지에서 시작됐는가 (이슈 #318).
 *
 * 쿠키 인증으로 **상태를 바꾸는** 비로그인·반로그인 경로에서 쓴다 — 비밀번호
 * 재설정의 링크 확인(세션 생성)과 완료(비밀번호 변경). 다른 사이트가 폼을
 * 자동 제출하면 브라우저는 우리 쿠키를 실어 보낸다. 그걸 여기서 거절한다.
 *
 * 브라우저가 붙이는 두 헤더를 본다. 둘 다 페이지 스크립트가 바꿀 수 없다.
 *
 *   1. `Sec-Fetch-Site` — 있으면 이것만 본다. `same-origin` 만 통과.
 *      `same-site` 도 거절한다: 같은 등록 도메인의 다른 서브도메인(미리보기
 *      배포 등)은 우리 origin 이 아니다.
 *   2. 없으면(구형 브라우저) `Origin` 이 이 요청의 origin 과 같아야 한다.
 *
 * 둘 다 없으면 거절한다. 현대 브라우저의 POST 에는 적어도 하나가 붙는다 —
 * 없다는 건 브라우저가 아니거나 알 수 없는 경로라는 뜻이고, 모를 때 여는 게
 * 이 기능이 새던 방식이다.
 */
export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "same-origin";

  const origin = request.headers.get("origin");
  if (origin === null || origin === "null") return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
