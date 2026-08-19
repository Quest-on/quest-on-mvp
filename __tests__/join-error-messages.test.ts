import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/**
 * 학생이 코드로 들어올 때 서버 영문이 화면에 뜨면 안 된다.
 *
 * 배포본에서 존재하지 않는 코드를 넣으면 이게 나왔다.
 *
 *   Exam not found
 *
 * `errData.message || t("codeCheckFailed")` 라서 서버 원문이 **항상** 이긴다.
 * 폴백은 서버가 message 를 안 줄 때만 쓰인다.
 *
 * 문구는 이미 다 있었다(`auth.join.examNotFound` 등). 코드가 안 쓴 것뿐이다.
 */
describe("코드 진입 오류 문구", () => {
  const page = read("app/(app)/join/page.tsx");

  it("서버 message 를 화면에 그대로 쓰지 않는다", () => {
    expect(page, "errData.message 가 폴백보다 먼저다").not.toMatch(
      /errData\.message\s*\|\|/
    );
  });

  it("에러 코드로 문구를 고른다", () => {
    expect(page, "코드 기반 매핑이 없다").toMatch(/resolveJoinError/);
  });

  it("서버가 내는 코드를 모두 덮는다", () => {
    // 안 덮인 코드는 일반 문구로 떨어져야 한다. 영문 원문이 아니라.
    const codes = [
      "EXAM_NOT_FOUND",
      "EXAM_NOT_AVAILABLE",
      "ENTRY_WINDOW_CLOSED",
      "ALREADY_SUBMITTED",
      "STUDENT_LIMIT_REACHED",
      "PUBLISH_LIMIT_REACHED",
    ];
    for (const c of codes) {
      expect(page, `${c} 를 다루지 않는다`).toContain(c);
    }
  });

  it("두 언어에 문구가 다 있다", () => {
    for (const locale of ["ko", "en"]) {
      const j = JSON.parse(read(`messages/${locale}/auth.json`)).join;
      for (const k of [
        "examNotFound",
        "examNotAvailable",
        "entryWindowClosed",
        "alreadySubmitted",
        "studentLimitReached",
        "publishLimitReached",
        "codeCheckFailed",
      ]) {
        expect(j?.[k], `${locale}.join.${k} 없음`).toBeTruthy();
      }
    }
  });

  it("한도 문구는 코드가 맞다는 것부터 말한다", () => {
    // 학생 잘못이 아니다. "코드가 틀렸나?" 하고 다시 치게 만들면 안 된다.
    const ko = JSON.parse(read("messages/ko/auth.json")).join;
    expect(ko.studentLimitReached).toMatch(/코드는 확인/);
    expect(ko.publishLimitReached).toMatch(/코드는 확인/);
  });
});

describe("같은 유출이 다른 진입 경로에도 없다", () => {
  it("exam / assignment 진입도 서버 원문을 안 쓴다", () => {
    const files = ["app/(app)/exam/[code]/page.tsx", "app/(app)/assignment/[code]/page.tsx"];
    const bad: string[] = [];
    for (const f of files) {
      const s = read(f);
      // toast/setError 에 서버 message 를 직접 넣는 자리
      // 코드를 매핑 함수에 넘기는 건 유출이 아니다. 화면 문자열로
      // 직접 들어가는 자리만 잡는다 - message/details 를 보간하거나
      // 폴백보다 앞세우는 형태.
      for (const m of s.matchAll(
        /(errData|errorData)\??\.(message|details)\s*\|\||detail:\s*(errData|errorData)\??\.(message|details)/g
      )) {
        bad.push(`${f}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(bad, `서버 원문을 화면에 흘린다:\n${bad.join("\n")}`).toHaveLength(0);
  });
});
