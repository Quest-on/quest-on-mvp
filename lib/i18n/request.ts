import { getRequestConfig } from "next-intl/server";
import { resolveLocale } from "./locale";

/** 메시지 네임스페이스 — messages/{locale}/<ns>.json */
export const namespaces = [
  "common",
  "landing",
  "legal",
  "auth",
  "onboarding",
  "instructor",
  "authoring",
  "grading",
  "student",
  "exam",
  "assignment",
  "report",
  "admin",
  "errors",
] as const;

export default getRequestConfig(async () => {
  const locale = await resolveLocale();

  const messages: Record<string, unknown> = {};
  for (const ns of namespaces) {
    messages[ns] = (await import(`../../messages/${locale}/${ns}.json`)).default;
  }

  return { locale, messages };
});
