import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * 연속성 경로의 소유권 계약.
 *
 * `proxy.ts` 는 body 를 읽을 수 없어 `/api/chat` 류의 소유권을 판정하지 못한다.
 * 그래서 동의 게이트는 이 경로들을 route 에 위임한다 — 위임이 성립하려면
 * **각 route 가 실제로 세션 소유권을 확인**해야 한다.
 *
 * 이 검사가 없으면 위임이 "아무도 안 본다" 가 된다. 동의 미완료 사용자가
 * 남의 세션 id 로 채팅·붙여넣기 로그·피드백을 건드릴 수 있게 된다.
 *
 * 실행 환경이 없어도 확인할 수 있는 정적 계약이다.
 */

const ROOT = path.resolve(__dirname, "..");

/** proxy 가 게이팅하지 않고 route 에 맡기는 연속성 경로. */
const CONTINUITY_ROUTES = [
  "app/api/chat/route.ts",
  "app/api/assignment-chat/route.ts",
  "app/api/log/paste/route.ts",
  "app/api/feedback/route.ts",
] as const;

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

/** 주석을 걷어낸 실제 코드. 주석 속 단어에 속지 않기 위해서다. */
function code(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

describe("연속성 경로 — 인증", () => {
  it.each(CONTINUITY_ROUTES)("%s 가 인증을 확인한다", (relative) => {
    const source = code(read(relative));
    // 인증 없이 세션을 만지면 소유권 개념 자체가 성립하지 않는다.
    expect(source).toMatch(/currentUser\(\)|getUser\(\)|auth\(\)/);
  });
});

describe("연속성 경로 — 세션 소유권", () => {
  it.each(CONTINUITY_ROUTES)("%s 가 인증 사용자와 실제로 대조한다", (relative) => {
    const source = code(read(relative));

    // 느슨한 검사(`student_id` 문자열 존재)는 "조회만 하고 대조 안 함" 도
    // 통과시킨다. 인증 사용자 id 와의 **비교**가 있어야 한다.
    // 인증에서 파생된 사용자 식별자의 통상적인 이름들.
    // `verifiedStudentId` 처럼 검증을 거쳤음을 이름에 담는 관습도 포함한다.
    const AUTHED = String.raw`(?:user|authedUser|userId|currentUserId|verified[A-Za-z]*Id)`;

    const comparesToAuthedUser =
      // .eq("student_id", <authed>)
      new RegExp(
        String.raw`\.eq\(\s*["']student_id["']\s*,\s*${AUTHED}\b[^)]*\)`,
      ).test(source) ||
      // session.student_id !== <authed>
      new RegExp(String.raw`student_id\s*(?:!==|===|!=|==)\s*${AUTHED}\b`).test(source) ||
      // <authed>.id !== session.student_id
      new RegExp(
        String.raw`${AUTHED}(?:\.id)?\s*(?:!==|===|!=|==)\s*[A-Za-z_$][\w$]*\.student_id`,
      ).test(source);

    expect(
      comparesToAuthedUser,
      `${relative} 가 student_id 를 인증 사용자와 대조하지 않는다 — ` +
        `proxy 가 위임했는데 route 도 안 보면 아무도 안 본다`,
    ).toBe(true);
  });

  it.each(CONTINUITY_ROUTES)("%s 가 진행 상태를 제한한다", (relative) => {
    const source = code(read(relative));

    // 끝난 시험 세션에 계속 쓸 수 있으면 연속성 예외가 영구 우회가 된다.
    const restrictsStatus =
      /in_progress/.test(source) ||
      /\bstatus\b[^\n]*(?:submitted|completed|closed|expired)/.test(source) ||
      /submitted_at/.test(source);

    expect(
      restrictsStatus,
      `${relative} 가 세션 진행 상태를 제한하지 않는다 — 종료된 세션으로도 통과한다`,
    ).toBe(true);
  });
});

describe("proxy — 연속성 위임 계약", () => {
  const proxySource = read("proxy.ts");

  /** `/api/` 블록만 잘라낸다. 페이지 판정부와 섞이지 않게 한다. */
  const apiBlock = proxySource.slice(
    proxySource.indexOf('if (pathname.startsWith("/api/"))'),
    proxySource.indexOf("// 테스트 바이패스"),
  );

  it("proxy 는 protected 만 막는다", () => {
    expect(apiBlock).toMatch(/apiRouteClass !== "protected"\) return response;/);
  });

  it("proxy 의 API 블록은 body 기반 소유권 판정을 시도하지 않는다", () => {
    // pathname 만으로는 body 에 sessionId 를 담는 경로에서 항상 실패한다.
    // 그 상태로 막으면 시험 중인 학생이 428 로 끊긴다.
    expect(apiBlock).not.toContain("ownsInProgressSession");
  });

  it("위임 사유가 코드에 남아 있다", () => {
    // 나중에 누가 "왜 여기서 안 막지?" 하고 되돌리는 걸 막는다.
    expect(apiBlock).toContain("body");
  });
});
