/**
 * ko/en 메시지 키 동일성 검사.
 * 각 네임스페이스의 ko/en JSON을 재귀 평탄화해 키 세트를 비교한다.
 * 누락/초과 키가 있으면 비영점 종료(CI 게이트).
 *
 * 실행: npx tsx scripts/i18n/check-messages.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_DIR = join(process.cwd(), "messages");
const LOCALES = ["ko", "en"] as const;

function flatten(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flatten(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

function loadKeys(locale: string, ns: string): Set<string> {
  const raw = readFileSync(join(MESSAGES_DIR, locale, ns), "utf8");
  return new Set(flatten(JSON.parse(raw)));
}

let failed = false;
const namespaceFiles = readdirSync(join(MESSAGES_DIR, "ko")).filter((f) => f.endsWith(".json"));

for (const ns of namespaceFiles) {
  const perLocale = LOCALES.map((l) => ({ locale: l, keys: loadKeys(l, ns) }));
  const [ko, en] = perLocale;

  const missingInEn = [...ko.keys].filter((k) => !en.keys.has(k));
  const missingInKo = [...en.keys].filter((k) => !ko.keys.has(k));

  if (missingInEn.length || missingInKo.length) {
    failed = true;
    console.error(`\n❌ ${ns}`);
    if (missingInEn.length) console.error(`   en에 없음: ${missingInEn.join(", ")}`);
    if (missingInKo.length) console.error(`   ko에 없음: ${missingInKo.join(", ")}`);
  }
}

if (failed) {
  console.error("\ni18n 메시지 키 불일치 — ko/en 키 세트를 맞추세요.");
  process.exit(1);
}
console.log("✓ i18n 메시지 키 동일성 OK");
