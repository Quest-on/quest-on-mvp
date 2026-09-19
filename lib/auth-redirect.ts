function normalizeHttpOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
  return url.origin;
}

/** 배포된 정규 도메인, 없으면 현재 origin. */
export function getAuthOrigin(currentOrigin: string): string {
  const declared = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return declared
    ? normalizeHttpOrigin(declared, "NEXT_PUBLIC_APP_URL")
    : normalizeHttpOrigin(currentOrigin, "currentOrigin");
}

/** Stable callback URL shared by email confirmation and OAuth flows. */
export function getAuthCallbackUrl(currentOrigin: string): string {
  return `${getAuthOrigin(currentOrigin)}/auth/callback`;
}

/** 계정 연결 전용 콜백. 기존 콜백은 온보딩으로 보내서 연결에 못 쓴다. */
export function getAccountLinkCallbackUrl(currentOrigin: string): string {
  return `${getAuthOrigin(currentOrigin)}/auth/link-callback`;
}
