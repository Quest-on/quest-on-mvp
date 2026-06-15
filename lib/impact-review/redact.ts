/**
 * 시크릿 리덕션. provider 에러·로그·예외 메시지에서 키/Authorization을 마스킹한다.
 * 읽기전용·secret-minimal 원칙: 키 substring이 로그/아티팩트에 남으면 안 된다.
 */

const KEY_ENV_NAMES = [
  "MOONSHOT_API_KEY",
  "KIMI_API_KEY",
  "GLM_API_KEY",
  "OPENAI_API_KEY",
  "ZHIPU_API_KEY",
];

function collectSecretValues(): string[] {
  const vals: string[] = [];
  for (const name of KEY_ENV_NAMES) {
    const v = process.env[name];
    if (v && v.length >= 6) vals.push(v);
  }
  return vals;
}

export function redactForLog(input: unknown): string {
  let s = typeof input === "string" ? input : safeStringify(input);

  // 1) 알려진 env 키 실제 값 마스킹.
  for (const secret of collectSecretValues()) {
    s = s.split(secret).join("[REDACTED]");
  }
  // 2) Authorization: Bearer <token>
  s = s.replace(/(Authorization:\s*Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[REDACTED]");
  // 3) sk-/sk-proj- 스타일 토큰.
  s = s.replace(/\bsk-[A-Za-z0-9._\-]{8,}\b/g, "sk-[REDACTED]");
  // 4) api_key=... / "apiKey":"..."
  s = s.replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9._\-]{8,}/gi, "$1[REDACTED]");

  return s;
}

function safeStringify(input: unknown): string {
  if (input instanceof Error) return `${input.name}: ${input.message}`;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
