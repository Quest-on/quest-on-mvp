import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const json = (p: string) => JSON.parse(read(p)) as Record<string, any>;

const HEADER = read("components/instructor/ExamDetailHeader.tsx");

/**
 * 재응시는 확인을 거친다. (#174 · 7)
 *
 * "다시 풀기" 는 `restart_demo_attempt` RPC 를 태우는데, 그 RPC 가
 * `grades` / `grading_chats` / `messages` / `submissions` /
 * `session_quiz_attempts` / `paste_logs` 를 **복구 불가능하게 DELETE** 한다
 * (`database/023_restart_demo_attempt.sql:61-66`).
 *
 * 예전에는 `<Link>` 한 번으로 갔다. 경고 문구가 버튼 아래 있었지만
 * **SQL 원자성이 사용자 의도 확인을 대신하지 않는다.**
 */
describe("재응시 확인 다이얼로그", () => {
  it("재응시가 다이얼로그를 거친다", () => {
    expect(HEADER).toMatch(/<AlertDialog>/);
    expect(HEADER).toMatch(/<AlertDialogTrigger asChild>/);
    expect(HEADER).toMatch(/AlertDialogAction/);
    expect(HEADER).toMatch(/AlertDialogCancel/);
  });

  it("확인을 눌러야 재응시 URL 로 간다", () => {
    // 다이얼로그만 띄우고 Link 가 그대로면 아무것도 막지 못한다.
    // import 문에도 AlertDialogAction 이 나온다. JSX 사용처를 겨냥한다.
    const action = HEADER.slice(HEADER.indexOf("<AlertDialogAction"));
    expect(action.slice(0, 300)).toMatch(/router\.push\(`\/exam\/\$\{code\}\?restartDemo=1`\)/);
  });

  it("확인 없이 restartDemo 로 가는 링크가 없다", () => {
    // `<Link href={.../?restartDemo=1}>` 이 남아 있으면 우회 경로가 된다.
    expect(HEADER).not.toMatch(/<Link\s+href=\{[^}]*restartDemo=1/);
  });

  it("미완료 데모는 확인 없이 바로 간다", () => {
    // 지울 게 없는 첫 응시까지 막으면 불필요한 마찰이다.
    expect(HEADER).toMatch(/<Link href=\{`\/exam\/\$\{code\}`\}>/);
  });
});

/**
 * 문구가 지워지는 것과 남는 것을 둘 다 말한다.
 */
describe("확인 문구", () => {
  it("ko/en 문구 5종이 있다", () => {
    for (const lang of ["ko", "en"]) {
      const d = json(`messages/${lang}/authoring.json`).examDetail;
      for (const key of [
        "restartConfirmTitle",
        "restartConfirmBody",
        "restartConfirmKeeps",
        "restartConfirmCta",
        "restartConfirmCancel",
      ]) {
        expect(d?.[key], `${lang}.${key} 누락`).toBeTruthy();
      }
    }
  });

  it("되돌릴 수 없다는 것을 말한다", () => {
    const ko = json("messages/ko/authoring.json").examDetail;
    expect(ko.restartConfirmBody).toMatch(/되돌릴 수 없/);
  });

  it("남는 것도 말한다", () => {
    // 지워지는 것만 말하면 시험까지 사라지는 줄 안다.
    const ko = json("messages/ko/authoring.json").examDetail;
    expect(ko.restartConfirmKeeps).toMatch(/시험|문항/);
  });

  it("확인 버튼이 결과를 말하는 동사구다", () => {
    // "확인" 은 무엇이 일어나는지 말하지 않는다.
    const ko = json("messages/ko/authoring.json").examDetail;
    expect(ko.restartConfirmCta).not.toBe("확인");
    expect(ko.restartConfirmCta).toMatch(/지우/);
  });
});
