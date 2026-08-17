import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 학생이 시험 보는 화면과 로그인·가입 화면의 색 계약. (#249 1·2단계)
 *
 * instructor 영역은 #228~#237 에서 토큰으로 옮기며 `dark:` 변형이 통째로
 * 사라졌다. 토큰이 라이트/다크를 이미 갖기 때문이다. exam 은 그때 손대지
 * 않아서 원색과 수동 `dark:` 가 남아 있었다.
 *
 * 이 화면은 학생이 시험을 치르는 동안 보는 곳이다. 다크모드에서 남은 시간
 * 경고가 안 보이면 시험을 놓친다.
 */
const FILES = [
  "components/exam/ExamTimer.tsx",
  "components/exam/PreflightModal.tsx",
  "components/exam/AnswerPanel.tsx",
  // 2단계: 로그인·가입. 첫 화면이라 다크모드에서 깨지면 바로 보인다.
  "components/auth/CustomSignUp.tsx",
  "components/auth/CustomSignIn.tsx",
] as const;

describe.each(FILES)("%s", (file) => {
  const SOURCE = readFileSync(resolve(process.cwd(), file), "utf8");

  it("원색을 직접 쓰지 않는다", () => {
    const found: string[] = [];
    SOURCE.split("\n").forEach((line, i) => {
      const m = line.match(
        /\b(bg|text|border|ring|divide)-(red|orange|amber|yellow|green|emerald|teal|blue|sky|indigo|violet|purple|gray|slate|zinc|neutral|stone)-\d{2,3}\b/g
      );
      if (m) found.push(`${file}:${i + 1} — ${m.join(", ")}`);
    });
    expect(found, found.join("\n")).toEqual([]);
  });

  it("수동 dark: 변형이 없다", () => {
    // 토큰이 라이트/다크를 이미 갖는다. 수동으로 덧붙이면 두 값이 어긋난다.
    const found: string[] = [];
    SOURCE.split("\n").forEach((line, i) => {
      const m = line.match(/dark:(bg|text|border|ring)-[a-z]+-\d{2,3}/g);
      if (m) found.push(`${file}:${i + 1} — ${m.join(", ")}`);
    });
    expect(found, found.join("\n")).toEqual([]);
  });
});

describe("exam·auth 화면이 실제로 토큰을 쓴다", () => {
  it("의미 토큰이 쓰이고 있다", () => {
    // 위 두 가드만 있으면 색을 통째로 지워도 통과한다. 반대편 증거를 둔다.
    const used = FILES.filter((f) =>
      /-(destructive|success|warning|info|muted|primary|border|foreground|background)/.test(
        readFileSync(resolve(process.cwd(), f), "utf8")
      )
    );
    expect(used.length).toBe(FILES.length);
  });

  it("시간 경고가 destructive 로 표현된다", () => {
    // 남은 시간 경고는 위험 신호다. 다른 의미 토큰으로 바뀌면 안 된다.
    expect(readFileSync(resolve(process.cwd(), "components/exam/ExamTimer.tsx"), "utf8")).toMatch(
      /destructive/
    );
  });
});
