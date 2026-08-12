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

/** Stable callback URL shared by email confirmation and OAuth flows. */
export function getAuthCallbackUrl(currentOrigin: string): string {
  const declared = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const origin = declared
    ? normalizeHttpOrigin(declared, "NEXT_PUBLIC_APP_URL")
    : normalizeHttpOrigin(currentOrigin, "currentOrigin");
  return `${origin}/auth/callback`;
}
