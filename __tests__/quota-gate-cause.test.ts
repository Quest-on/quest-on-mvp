import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveCodeGate } from "@/components/instructor/ExamCode";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const json = (p: string) => JSON.parse(read(p)) as Record<string, any>;

/**
 * 게이트가 심각도만 돌려주고 **원인을 버렸다** (이슈 #393).
 *
 * `resolveCodeGate` 는 발행 한도와 학생 자리 두 가지 이유로 warning/blocked 를
 * 내는데 반환값이 `"warning" | "blocked"` 뿐이라, 호출부가 원인을 복원할 방법이
 * 없었다. 그래서 렌더는 원인과 무관하게 항상 발행 한도 문구를 썼다.
 *
 * 실제로 교수자가 본 화면: 쓸 수 있는 코드 옆에
 * "무료 등급에서 앞으로 0개 시험까지 학생을 받을 수 있습니다."
 */
describe("게이트가 원인을 함께 돌려준다", () => {
  describe("학생 자리가 원인일 때", () => {
    // free 교수자, 발행 3개 소진(publishesRemaining=0), 그중 한 시험이
    // 이미 발행됨. 발행 한도는 다시 적용되지 않으므로 코드는 멀쩡히 쓸 수
    // 있고, 걸리는 건 이 시험의 학생 자리뿐이다.
    const alreadyPublishedExam = {
      alreadyPublished: true,
      publishesRemaining: 0,
    };

    it("자리가 얼마 안 남으면 학생 원인으로 경고한다", () => {
      expect(
        resolveCodeGate({ ...alreadyPublishedExam, studentsRemaining: 2 })
      ).toEqual({ level: "warning", reason: "student" });
    });

    it("자리가 없으면 학생 원인으로 막는다", () => {
      expect(
        resolveCodeGate({ ...alreadyPublishedExam, studentsRemaining: 0 })
      ).toEqual({ level: "blocked", reason: "student" });
    });
  });

  describe("발행 한도가 원인일 때", () => {
    it("임박하면 발행 원인으로 경고한다", () => {
      expect(resolveCodeGate({ publishesRemaining: 1 })).toEqual({
        level: "warning",
        reason: "publish",
      });
    });

    it("도달하면 발행 원인으로 막는다", () => {
      expect(resolveCodeGate({ publishesRemaining: 0 })).toEqual({
        level: "blocked",
        reason: "publish",
      });
    });
  });

  describe("둘 다 걸릴 때", () => {
    it("더 심각한 쪽을 고른다 — 발행 차단이 학생 경고를 이긴다", () => {
      expect(
        resolveCodeGate({ publishesRemaining: 0, studentsRemaining: 2 })
      ).toEqual({ level: "blocked", reason: "publish" });
    });

    it("심각도가 같으면 학생 자리가 이긴다", () => {
      // 코드를 건네려는 시점에 더 급한 건 이 시험의 자리다. 발행 한도는
      // 다음 시험의 문제고, 학생 자리는 지금 이 코드의 문제다.
      expect(
        resolveCodeGate({ publishesRemaining: 1, studentsRemaining: 2 })
      ).toEqual({ level: "warning", reason: "student" });
    });
  });

  describe("열려 있으면 원인이 없다", () => {
    it("여유가 있으면 open 이고 reason 은 null 이다", () => {
      expect(resolveCodeGate({ publishesRemaining: 3 })).toEqual({
        level: "open",
        reason: null,
      });
    });

    it("데모와 모르는 값은 원인 없이 열린다", () => {
      expect(
        resolveCodeGate({ isDemo: true, publishesRemaining: 0, studentsRemaining: 0 })
      ).toEqual({ level: "open", reason: null });
      expect(resolveCodeGate(undefined)).toEqual({ level: "open", reason: null });
      expect(resolveCodeGate({})).toEqual({ level: "open", reason: null });
    });
  });
});

describe("문구가 원인을 따라간다", () => {
  const source = read("components/instructor/ExamCode.tsx");

  it("경고 문구가 원인별로 갈린다", () => {
    expect(source).toMatch(/warningStudent/);
    expect(source).toMatch(/warningPublish/);
  });

  it("차단 본문이 원인별로 갈린다", () => {
    expect(source).toMatch(/blockedBodyStudent/);
    expect(source).toMatch(/blockedBodyPublish/);
  });

  it("학생 자리 경고에 발행 잔여를 끼워넣지 않는다", () => {
    // 이게 정확히 그 버그였다: 원인이 무엇이든 publishesRemaining 을 넣었다.
    // 발행 잔여가 0인데 코드는 멀쩡히 쓸 수 있는 상태에서
    // "앞으로 0개 시험까지" 가 떴다.
    const warningStudentCall = source.match(/warningStudent[^)]*\)/)?.[0] ?? "";
    expect(warningStudentCall).not.toMatch(/publishesRemaining/);
  });
});

describe("메시지가 ko/en 양쪽에 있다", () => {
  const required = [
    "warningPublish",
    "warningStudent",
    "blockedBodyPublish",
    "blockedBodyStudent",
  ];

  for (const locale of ["ko", "en"]) {
    it(`${locale} 에 원인별 키가 모두 있다`, () => {
      const examCode = json(`messages/${locale}/authoring.json`).examCode;
      for (const key of required) {
        expect(examCode?.[key], `${locale}.examCode.${key} 없음`).toBeTruthy();
      }
    });
  }

  it("학생 자리 문구가 발행을 언급하지 않는다", () => {
    const ko = json("messages/ko/authoring.json").examCode;
    expect(ko.warningStudent).not.toMatch(/발행/);
    expect(ko.blockedBodyStudent).not.toMatch(/발행/);
  });
});

describe("드라이브 목록도 학생 한도를 본다", () => {
  const drive = read("components/instructor/InstructorHomeClient.tsx");

  it("게이트 호출에 studentsRemaining 을 넘긴다", () => {
    // 안 넘기면 5자리가 꽉 찬 시험 코드가 목록에서 그대로 복사돼 나간다.
    // 상세 화면에 들어가지 않는 교수자는 끝까지 모른다.
    const gateCall = drive.match(/resolveCodeGate\(\{[\s\S]*?\}\)/)?.[0] ?? "";
    expect(gateCall, "드라이브 게이트가 학생 한도를 판정에 안 넣는다").toMatch(
      /studentsRemaining/
    );
  });

  it("플랜 상한이 아니라 이 시험의 실제 학생 수로 잔여를 계산한다", () => {
    // 상한을 그대로 넘기면 이미 5명 받은 시험도 "5자리 남음" 이 된다.
    expect(drive).toMatch(/student_count/);
  });
});
