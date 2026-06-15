import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 거울(mirror) drift 회귀 가드.
 *
 * exam/assignment의 생성·수정 페이지가 출제 검증 헬퍼를 다시 복붙으로
 * 로컬 선언하면(과거 "new/page.tsx와 동일" 사고) 이 테스트가 실패한다.
 * 공용 소스는 `lib/authoring-validation.ts` 하나뿐이어야 한다.
 */

const REPO_ROOT = path.resolve(__dirname, "..");

const MIRROR_PAGES = [
  "app/(app)/instructor/new/page.tsx",
  "app/(app)/instructor/[examId]/edit/page.tsx",
  "app/(app)/instructor/assignment/new/page.tsx",
  "app/(app)/instructor/assignment/[assignmentId]/edit/page.tsx",
];

const SHARED_HELPERS = [
  "isQuestionContentEmpty",
  "isObjectiveQuestionIncomplete",
] as const;

const SHARED_IMPORT = "@/lib/authoring-validation";

function read(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

describe("authoring-validation mirror-drift guard", () => {
  it("declares each shared helper exactly once, in lib/authoring-validation.ts", () => {
    const src = read("lib/authoring-validation.ts");
    for (const helper of SHARED_HELPERS) {
      expect(src).toMatch(new RegExp(`function\\s+${helper}\\b`));
    }
  });

  for (const page of MIRROR_PAGES) {
    describe(page, () => {
      const src = read(page);

      for (const helper of SHARED_HELPERS) {
        it(`does not redeclare a local ${helper} (no copy-paste drift)`, () => {
          expect(src).not.toMatch(new RegExp(`function\\s+${helper}\\b`));
          expect(src).not.toMatch(new RegExp(`const\\s+${helper}\\b`));
        });

        it(`imports ${helper} from the shared module when it uses it`, () => {
          const usesHelper = new RegExp(`\\b${helper}\\s*\\(`).test(src);
          if (!usesHelper) return; // 해당 페이지가 헬퍼를 안 쓰면 import 강제 안 함
          expect(src).toContain(SHARED_IMPORT);
          // import 라인 안에 헬퍼 이름이 있어야 한다.
          const importBlock = src.slice(0, src.indexOf("export default"));
          expect(importBlock).toMatch(new RegExp(`${helper}[\\s\\S]*${SHARED_IMPORT.replace(/[/\\]/g, "\\$&")}`));
        });
      }

      it("uses isQuestionContentEmpty, not an inline HTML-strip+trim emptiness check (no &nbsp; drift)", () => {
        // `q.text.replace(/<[^>]*>/g, "").trim()` 은 &nbsp; 정규화가 빠져 헬퍼와 의미가 달라진다.
        expect(src).not.toMatch(/\.replace\(\/<\[\^>\]\*>\/g,\s*""\)\.trim\(\)/);
      });
    });
  }
});
