/**
 * 막아 놓고 "공유하세요" 라고 적지 않는다 (이슈 #470).
 *
 * `ExamCode` 는 차단 상태에서 코드를 **아예 내보내지 않는다**(#84) — 보여주고
 * "쓰지 마세요" 라고 적는 건 이미 복사해서 배포한 뒤라 소용이 없기 때문이다.
 *
 * 그런데 안내 문장("이 코드를 학생들에게 공유하세요")이 호출부의 형제 `<p>` 에
 * 있으면 코드가 사라진 자리에 그 문장만 남는다. 배포본 staging 에서 실제로
 * 이렇게 보였다:
 *
 *   시험 코드
 *   ⚠ 교수자 인증이 필요합니다 — 지금 코드를 공유해도 학생이 들어오지 못합니다.
 *   이 코드를 학생들에게 공유하세요.        ← 바로 위와 정면으로 모순
 *
 * `StudentHandoffCard` 는 같은 문제를 이미 풀어 뒀다("없는 것을 복사하라고 적지
 * 않는다"). 나중에 생긴 두 대화상자가 그걸 몰랐다 — `ExamCode` docstring 이
 * 예언한 "표면마다 따로 붙이면 다음 표면이 반드시 잊는다" 가 그대로 일어났다.
 *
 * 그래서 안내를 `ExamCode` 가 소유하게 하고, 형제 `<p>` 형태가 되살아나는 걸
 * 여기서 막는다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveCodeGate } from "@/components/instructor/ExamCode";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const SURFACES = [
  { path: "app/(app)/instructor/new/page.tsx", key: "newExam.dialogShare" },
  { path: "app/(app)/instructor/assignment/new/page.tsx", key: "newAssignment.dialogShare" },
] as const;

describe("공유 안내는 ExamCode 가 소유한다 (#470)", () => {
  it.each(SURFACES)("$path 가 안내를 shareHint 로 넘긴다", ({ key }) => {
    const src = read(SURFACES.find((s) => s.key === key)!.path);
    expect(src, `${key} 를 shareHint 로 넘기지 않는다`).toMatch(
      new RegExp(`shareHint=\\{t\\("${key.replace(".", "\\.")}"\\)\\}`)
    );
  });

  it.each(SURFACES)("$path 가 안내를 형제 <p> 로 되살리지 않는다", ({ path, key }) => {
    const src = read(path);
    // `<p …>{t("…dialogShare")}</p>` 형태가 돌아오면 차단 상태에서 다시
    // 모순된 화면이 된다.
    const sibling = new RegExp(
      `<p[^>]*>\\s*\\{t\\("${key.replace(".", "\\.")}"\\)\\}`,
      "s"
    );
    expect(src, `${key} 가 형제 <p> 로 돌아왔다 — 차단 시 "없는 코드를 공유하세요" 가 된다`).not.toMatch(
      sibling
    );
  });

  it("ExamCode 는 차단이면 안내에 닿기 전에 반환한다", () => {
    const src = read("components/instructor/ExamCode.tsx");

    const blockedReturn = src.indexOf('if (gate.level === "blocked")');
    const hintRender = src.indexOf("{shareHint && <p");

    expect(blockedReturn, "차단 분기가 사라졌다").toBeGreaterThan(-1);
    expect(hintRender, "shareHint 를 렌더하지 않는다").toBeGreaterThan(-1);
    // 차단 early return 이 안내보다 **앞**에 있어야 한다. 뒤로 가면 차단
    // 상태에서도 안내가 렌더된다.
    expect(
      blockedReturn,
      "차단 early return 이 shareHint 렌더 뒤로 밀렸다 — 막아 놓고 공유하라고 적게 된다"
    ).toBeLessThan(hintRender);
  });
});

describe("차단 판정은 그대로다 (#84 · #393 회귀 방지)", () => {
  it("발행 잔여 0 이면 차단하고 원인을 publish 로 말한다", () => {
    expect(resolveCodeGate({ publishesRemaining: 0, alreadyPublished: false })).toEqual({
      level: "blocked",
      reason: "publish",
    });
  });

  it("이미 발행한 시험은 발행 한도를 다시 적용하지 않는다", () => {
    expect(resolveCodeGate({ publishesRemaining: 0, alreadyPublished: true })).toEqual({
      level: "open",
      reason: null,
    });
  });

  it("학생 자리가 없으면 원인을 student 로 말한다", () => {
    expect(resolveCodeGate({ studentsRemaining: 0 })).toEqual({
      level: "blocked",
      reason: "student",
    });
  });

  it("데모는 어느 한도도 보지 않는다", () => {
    expect(resolveCodeGate({ isDemo: true, publishesRemaining: 0 })).toEqual({
      level: "open",
      reason: null,
    });
  });

  it("모르는 값은 막지 않는다 — 조회 실패와 자리 없음은 다르다", () => {
    expect(resolveCodeGate({ publishesRemaining: null, studentsRemaining: null })).toEqual({
      level: "open",
      reason: null,
    });
  });
});
