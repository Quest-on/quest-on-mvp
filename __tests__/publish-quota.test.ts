/**
 * 발행 한도 게이트 (이슈 #84).
 *
 * 핵심은 **코드 반출 표면을 하나로 수렴시켰는지**다. 표면마다 quota UI 를 따로
 * 붙이면 다음에 생기는 표면에서 반드시 잊힌다 — `is_demo` 제외 필터에서 이미
 * 똑같이 겪었고, 그때 deny-by-default 레지스트리로 막았다. 같은 방식을 쓴다.
 *
 * 막지 못하면 벌어지는 일: 교수자가 네 번째 시험 코드를 수업 자료에 배포한 뒤
 * 수업 중에 학생 전원이 입장 거부를 당한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (rel: string) =>
  readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

/**
 * 시험 코드를 화면에 내보낼 수 있는 파일과 그 사유.
 *
 * **deny-by-default.** 여기 없는 파일이 코드를 렌더하면 테스트가 실패한다.
 * 새 표면을 만들었다면 `ExamCode` 를 쓰거나, 왜 예외인지 여기 적어라.
 */
const CODE_RENDER_REGISTRY: Record<string, string> = {
  "components/instructor/ExamCode.tsx":
    "코드를 내보내는 유일한 컴포넌트. 여기서 한도를 판정한다.",
  "app/(app)/join/page.tsx":
    "학생이 코드를 **입력**하는 화면이다. 교수자에게 반출하는 표면이 아니다.",
  "app/(app)/student/report/[sessionId]/page.tsx":
    "학생이 이미 응시를 마친 뒤 보는 결과지다. 이 코드로 새 학생을 부를 수 없다.",
  "components/instructor/QuickActionsCard.tsx":
    "채점 결과지 안의 시험 식별 표기다. 응시가 끝난 시험이라 발행 한도와 무관하다.",
  "components/landing/DemoExperienceSection.tsx":
    "랜딩의 하드코딩된 예시 화면이다. 실제 시험 코드가 아니다.",
  "components/instructor/InstructorHomeClient.tsx":
    "복사 핸들러가 gateBlocked 를 먼저 확인하고 막는다. 코드 렌더는 ExamCard 의 ExamCode 가 맡는다.",
  "app/(app)/instructor/assignment/[assignmentId]/page.tsx":
    "코드 렌더는 ExamCode 로 옮겼다. 남은 writeText 는 그 컴포넌트가 이미 게이트를 통과시킨 코드다.",
};

function collectSources(dirs: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (abs: string) => {
    if (statSync(abs).isFile()) {
      if (!/\.tsx$/.test(abs)) return;
      out.push([
        path.relative(root, abs).replace(/\\/g, "/"),
        readFileSync(abs, "utf8").replace(/\r\n/g, "\n"),
      ]);
      return;
    }
    for (const entry of readdirSync(abs)) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(path.join(abs, entry));
    }
  };
  for (const dir of dirs) walk(path.join(root, dir));
  return out;
}

describe("코드 반출 표면이 하나로 수렴한다", () => {
  const sources = collectSources(["app", "components"]);

  it("등록되지 않은 파일이 시험 코드를 렌더하지 않는다", () => {
    const offenders: string[] = [];

    for (const [file, source] of sources) {
      if (CODE_RENDER_REGISTRY[file]) continue;
      // 화면에 코드를 **그리거나** 클립보드에 담는 패턴만 본다.
      //   - `<span>{exam.code}</span>` → 위반
      //   - `clipboard.writeText(exam.code)` → 위반
      //   - `code={exam.code}` → 위반 아님(ExamCode 에 넘기는 것)
      //   - `code: exam.code` → 위반 아님(데이터 전달)
      const rendersRawCode =
        /(?:^|[>\s])\{\s*[\w.?]*\bexam\??\.code\s*\}/m.test(
          source.replace(/\bcode=\{[^}]*\}/g, "")
        ) ||
        /clipboard\.writeText\(\s*[\w.?]*\bcode\b/.test(source);
      if (rendersRawCode) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it("레지스트리 항목마다 사유가 있다", () => {
    for (const [file, reason] of Object.entries(CODE_RENDER_REGISTRY)) {
      expect(reason.length, `${file} 에 사유가 없다`).toBeGreaterThan(10);
    }
  });
});

describe("한도 게이트 판정", () => {
  it("데모는 어떤 안내도 띄우지 않는다", async () => {
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ isDemo: true, publishesRemaining: 0 })).toBe("open");
  });

  it("이미 발행된 시험에는 발행 한도를 다시 적용하지 않는다", async () => {
    // 재적용하면 한도를 넘긴 교수자의 진행 중인 시험이 수업 도중에 멈춘다.
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ alreadyPublished: true, publishesRemaining: 0 })).toBe("open");
  });

  it("무제한이면 열려 있다", async () => {
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ publishesRemaining: null })).toBe("open");
  });

  it("한도에 도달하면 차단한다", async () => {
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ publishesRemaining: 0 })).toBe("blocked");
  });

  it("임박하면 경고한다", async () => {
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ publishesRemaining: 1 })).toBe("warning");
  });

  it("여유가 있으면 조용하다 — 상시 카운터는 두지 않는다", async () => {
    // 발행 카운트는 "만든 시험 수"가 아니라 "첫 학생이 들어온 시험 수"라
    // `1/3 사용` 같은 표시는 의미부터 틀리고 첫 경험을 제약 중심으로 만든다.
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ publishesRemaining: 3 })).toBe("open");
  });

  it("quota 를 모르면 막지 않는다 — fail-open", async () => {
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate(undefined)).toBe("open");
    expect(resolveCodeGate({})).toBe("open");
  });
});

describe("차단 상태에서는 코드를 아예 내보내지 않는다", () => {
  const source = read("components/instructor/ExamCode.tsx");

  it("차단이면 코드 문자열과 복사 버튼이 렌더되지 않는다", () => {
    // 보여주고 "쓰지 마세요"라고 적는 건 소용없다 — 이미 복사해 배포한 뒤다.
    const blocked = source.slice(
      source.indexOf('if (gate === "blocked")'),
      source.indexOf("return (\n    <div className={cn(\"space-y-1\"")
    );
    expect(blocked).not.toMatch(/\{code\}/);
    expect(blocked).toMatch(/blockedTitle/);
  });
});
