import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { qk } from "@/lib/query-keys";
import { ADMIN_NAVIGATION_ITEMS } from "@/lib/admin-navigation";

/**
 * 관리자 AI 설정 화면 배선 (이슈 #118, AC-19)
 *
 * 최소 범위 계약: 편집 폼 + 서버 검증 에러 + 현재 버전 표시까지만.
 * 버전 목록/diff/롤백 버튼/적용 현황은 **만들지 않는다**(후속 이슈).
 */

const PAGE_SOURCE = readFileSync(
  path.join(process.cwd(), "app", "admin", "ai-config", "page.tsx"),
  "utf8"
);

const KO = JSON.parse(
  readFileSync(path.join(process.cwd(), "messages", "ko", "admin.json"), "utf8")
);
const EN = JSON.parse(
  readFileSync(path.join(process.cwd(), "messages", "en", "admin.json"), "utf8")
);

function leafKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k)
  );
}

describe("query key and navigation wiring", () => {
  it("exposes a stable admin AI config query key", () => {
    expect(qk.admin.aiConfig()).toEqual(["admin-ai-config"]);
  });

  it("adds the admin nav entry pointing at the new page", () => {
    const item = ADMIN_NAVIGATION_ITEMS.find((entry) => entry.href === "/admin/ai-config");
    expect(item).toBeDefined();
    expect(item?.titleKey).toBe("nav.aiConfig");
  });
});

describe("i18n", () => {
  it("ships the aiConfig namespace in both locales with identical keys", () => {
    expect(KO.aiConfig).toBeDefined();
    expect(EN.aiConfig).toBeDefined();
    expect(leafKeys(KO.aiConfig).sort()).toEqual(leafKeys(EN.aiConfig).sort());
  });

  it("translates every field and source label the page renders", () => {
    for (const field of [
      "model",
      "timeoutMs",
      "maxRetries",
      "maxTokens",
      "temperature",
      "reasoningEffort",
    ]) {
      expect(KO.aiConfig.fields[field]).toBeTruthy();
      expect(EN.aiConfig.fields[field]).toBeTruthy();
    }
    for (const source of ["code", "global_env", "task_env", "admin"]) {
      expect(KO.aiConfig.sources[source]).toBeTruthy();
      expect(EN.aiConfig.sources[source]).toBeTruthy();
    }
  });

  it("has a nav label in both locales", () => {
    expect(KO.nav.aiConfig).toBeTruthy();
    expect(EN.nav.aiConfig).toBeTruthy();
  });
});

describe("page wiring", () => {
  it("uses TanStack Query with the shared key and invalidates after publishing", () => {
    expect(PAGE_SOURCE).toMatch(/useQuery\(/);
    expect(PAGE_SOURCE).toMatch(/useMutation\(/);
    expect(PAGE_SOURCE).toMatch(/qk\.admin\.aiConfig\(\)/);
    expect(PAGE_SOURCE).toMatch(/invalidateQueries\(\{ queryKey: qk\.admin\.aiConfig\(\) \}\)/);
  });

  it("blocks saving without a change reason", () => {
    expect(PAGE_SOURCE).toMatch(/reason\.trim\(\) === ""/);
  });

  it("surfaces server validation errors instead of swallowing them", () => {
    expect(PAGE_SOURCE).toMatch(/setServerError/);
    expect(PAGE_SOURCE).toMatch(/body\?\.message/);
  });

  it("renders a layout-matched skeleton while loading", () => {
    expect(PAGE_SOURCE).toMatch(/Skeleton/);
    expect(PAGE_SOURCE).toMatch(/isLoading/);
  });

  it("offers an explicit-none control so an inherited optional value can be removed", () => {
    // 입력창만 있으면 상속과 값 두 상태뿐이라 optional 을 끌 방법이 없다.
    expect(PAGE_SOURCE).toMatch(/NULLABLE_FIELDS/);
    expect(PAGE_SOURCE).toMatch(/-none`/);
    expect(PAGE_SOURCE).toMatch(/<Checkbox/);
    expect(PAGE_SOURCE).toMatch(/isExplicitNull/);
  });

  it("preserves an explicit null instead of collapsing it to inheritance", () => {
    expect(PAGE_SOURCE).toMatch(/if \(raw === null\)/);
    expect(PAGE_SOURCE).toMatch(/target\[key\] = null/);
  });

  it("treats an empty input as inheritance rather than a written value", () => {
    // 이 규칙이 깨지면 첫 저장에 env/코드 기본값이 영구히 물질화된다.
    expect(PAGE_SOURCE).toMatch(/raw === undefined \|\| raw === ""/);
    expect(PAGE_SOURCE).toMatch(/delete target\[key\]/);
  });

  it("does not ship the deferred history, diff, rollback or usage surfaces", () => {
    // 코드만 본다 — 이 페이지의 주석은 "만들지 않는다" 고 적혀 있어서
    // 주석을 지우지 않으면 가드가 자기 설명문에 걸린다.
    const code = PAGE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/rollback/i);
    expect(code).not.toMatch(/\bdiff\b/i);
    expect(code).not.toMatch(/versionHistory/i);
  });

  it("uses shadcn primitives rather than raw form elements", () => {
    expect(PAGE_SOURCE).toMatch(/@\/components\/ui\/card/);
    expect(PAGE_SOURCE).toMatch(/@\/components\/ui\/input/);
    expect(PAGE_SOURCE).toMatch(/@\/components\/ui\/alert/);
    expect(PAGE_SOURCE).not.toMatch(/<input\s/);
  });
});
