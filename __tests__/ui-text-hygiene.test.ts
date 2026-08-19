import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(__dirname, "..");
const messageFiles = () =>
  execSync("git ls-files messages", { cwd: root, encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    // legal.json 은 제외한다. 동의 기록이 이 문안의 해시를 고정하고 있어서
    // 문장부호 하나만 바꿔도 이미 받은 동의가 무효가 된다
    // (consent-policy-release.test.ts 가 그 해시를 지킨다).
    .filter((f) => !f.endsWith("/legal.json"));

function walk(o: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof o === "string") out.push([path, o]);
  else if (o && typeof o === "object")
    for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k, out);
  return out;
}

const allStrings = () => {
  const out: { file: string; key: string; value: string }[] = [];
  for (const f of messageFiles()) {
    const j = JSON.parse(readFileSync(resolve(root, f), "utf8"));
    for (const [key, value] of walk(j, "", [])) out.push({ file: f, key, value });
  }
  return out;
};

describe("사용자 노출 문구 규칙", () => {
  it("중간점(·)을 쓰지 않는다", () => {
    // 나열은 쉼표로 한다. 중간점은 한국어 본문에서 읽기 리듬을 끊는다.
    const bad = allStrings()
      .filter((s) => s.value.includes("·"))
      .map((s) => `${s.file} ${s.key}\n    ${s.value.slice(0, 70)}`);
    expect(bad, `중간점을 쓴 문구:\n${bad.join("\n")}`).toHaveLength(0);
  });

  it("앰대쉬(—)를 쓰지 않는다", () => {
    // 부연이면 문장을 끊고, 라벨이면 콜론을 쓴다.
    const bad = allStrings()
      .filter((s) => s.value.includes("—"))
      .map((s) => `${s.file} ${s.key}\n    ${s.value.slice(0, 70)}`);
    expect(bad, `앰대쉬를 쓴 문구:\n${bad.join("\n")}`).toHaveLength(0);
  });

  it("검사 전제가 살아 있다", () => {
    // 메시지가 하나도 없으면 위 두 검사가 자동 통과한다.
    expect(allStrings().length, "메시지 문자열이 없다").toBeGreaterThan(500);
  });

  it("번역 키가 화면 문구로 새지 않는다", () => {
    // `questionNavigation.typePrefixCase 1` 이 그대로 렌더된 적이 있다.
    // 키를 문자열에 이어 붙이면 번역을 건너뛴다.
    const src = readFileSync(
      resolve(root, "components/instructor/QuestionNavigation.tsx"),
      "utf8"
    );
    expect(src, "레이블이 번역을 거치지 않는다").toMatch(
      /translate\(key\)/
    );
    expect(src, "키를 그대로 이어 붙인다").not.toMatch(
      /\$\{prefix\}\s*\$\{counters\[prefix\]\}/
    );
  });
});
