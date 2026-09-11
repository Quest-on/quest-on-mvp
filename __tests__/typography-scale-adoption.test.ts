import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * 역할 클래스가 실제로 쓰이고 있어야 한다. (#249 5단계)
 *
 * `#248` 이 `type-*` 6종을 정의했지만 정의만으로는 중앙화가 아니다.
 * 아무도 안 쓰면 크기가 계속 화면마다 흩어진다.
 *
 * 착수 전 실측: `text-*` 1172건 / 235파일, 8가지 크기 x 4가지 굵기.
 */
const tsxFiles = () =>
  execSync("git ls-files components app", { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => /\.tsx$/.test(f));

const ROLE_RE = /\btype-(page-title|section-title|field-label|body|hint|meta)\b/;

describe("타입 스케일 채택", () => {
  it("역할 클래스가 널리 쓰이고 있다", () => {
    const used = tsxFiles().filter((f) => {
      try {
        return ROLE_RE.test(readFileSync(f, "utf8"));
      } catch {
        return false;
      }
    });
    expect(used.length).toBeGreaterThan(40);
  });

  it("역할이 명확한 조합이 다시 흩어지지 않는다", () => {
    // 정확 일치만 본다. `text-sm` 단독처럼 문맥이 필요한 건 대상이 아니다 —
    // 같은 클래스가 라벨일 수도, 본문일 수도 있어서 기계적으로 못 바꾼다.
    const EXACT = [
      '"text-sm font-medium"',
      '"text-base font-semibold"',
      '"text-sm text-muted-foreground"',
      '"text-xs text-muted-foreground"',
    ];
    const offenders: string[] = [];
    for (const file of tsxFiles()) {
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      source.split("\n").forEach((line, i) => {
        for (const pat of EXACT) {
          if (line.includes(pat)) offenders.push(file + ":" + (i + 1) + " — " + pat);
        }
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("스케일에 없는 조합은 그대로 둔다", () => {
    // text-sm font-semibold / text-xs font-medium 은 6종 어디에도 없다.
    // 억지로 끼워 맞추면 위계가 거짓이 된다. 남아 있는 게 정상이다.
    const remaining = tsxFiles().filter((f) => {
      try {
        return /"text-sm font-semibold"|"text-xs font-medium"/.test(readFileSync(f, "utf8"));
      } catch {
        return false;
      }
    });
    expect(remaining.length).toBeGreaterThan(0);
  });
});
