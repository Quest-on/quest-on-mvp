/**
 * 교수자가 자기 데모를 학생 시점으로 겪는 경로 (이슈 #163 / AC-7).
 *
 * 에픽 #79 의 목표가 "가입 직후 자기 과목 데모를 학생 시점으로 끝까지 겪는 것"인데,
 * 이 검사 없이는 교수자가 자기 시험 코드로 들어와도 학생 프로필 게이트에서
 * 막혀 완주에 도달할 수 없었다.
 *
 * 서버는 `exams.is_demo && exam.instructor_id === user.id` 로만 판정해 `demoPreview`
 * 를 내린다. 클라이언트가 스스로 is_demo 를 판정하게 하면 남의 데모나 일반 시험
 * 까지 우회될 수 있다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const handlers = readFileSync(
  "app/api/supa/handlers/session-handlers.ts",
  "utf8"
).replace(/\r\n/g, "\n");
const hook = readFileSync("hooks/useExamSession.ts", "utf8").replace(/\r\n/g, "\n");

describe("데모 미리보기 서버 판정 (AC-7)", () => {
  it("init 은 exam 에 is_demo 를 읽어 들인다", () => {
    expect(handlers).toContain("instructor_id, is_demo,");
  });

  it("데모 미리보기는 is_demo 와 소유자 둘 다 만족할 때만이다", () => {
    // is_demo 만이거나, 소유자만이면 안 된다. 둘 다여야 데모 미리보기다.
    expect(handlers).toMatch(
      /const isDemoPreview = exam\.is_demo === true && exam\.instructor_id === user\.id;/
    );
  });

  it("init 응답이 demoPreview 를 실어 본다", () => {
    expect(handlers).toMatch(/demoPreview: isDemoPreview,/);
  });

  it("범위를 좁히는 이유가 주석에 남아 있다 — 일반 시험까지 열리면 통계를 오염시킨다", () => {
    // 이 주석이 지워지면 다음 사람이 "그냥 instructor_id 만 본다"로 완화할 수 있다.
    const demoPreviewBlock = handlers.slice(
      handlers.indexOf("const isDemoPreview") - 400,
      handlers.indexOf("const isDemoPreview")
    );
    expect(demoPreviewBlock).toContain("is_demo=true");
    expect(demoPreviewBlock).toContain("오염");
  });
});

describe("클이언트 프로필 게이트 우회 (AC-7)", () => {
  it("init 이 게이트보다 먼저 돌고, 게이트는 init 을 기다린다", () => {
    // init 이 profileGateChecked 를 기다리면 데모 소유자는 영원히 게이트에 걸린다.
    // 그래서 init 은 게이트를 기다리지 않고, 게이트가 init 결과를 기다린다.
    expect(hook).toMatch(/enabled: !!examCode && isLoaded && !!user,?\n/);
    expect(hook).not.toMatch(/enabled: .*profileGateChecked/);
  });

  it("demoPreview 이면 학생 프로필 없이도 우회한다", () => {
    expect(hook).toContain("initData.demoPreview");
    // 우회는 게이트를 통과시키는 것이지, 리다이렉트를 건드리는 것이 아니다.
    expect(hook).toMatch(/if \(initData\.ok && initData\.demoPreview\) \{/);
  });

  it("데모가 아니면 학생 프로필이 없을 때 여전히 리다이렉트한다", () => {
    // 우회가 너무 넓으면 학생 온볼딩 흐름이 깨진다. demoPreview 가 아닌 경우
    // 프로필 없음 → profile-setup 으로 가는 경로가 살아 있어야 한다.
    expect(hook).toContain("/student/profile-setup?redirect=");
  });
});
