import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveCodeGate } from "@/components/instructor/ExamCode";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/**
 * 코드를 뿌리기 전에 학생 한도를 알려준다.
 *
 * 서버는 두 가지 이유로 학생 진입을 막는다(`admit_exam_session`).
 *
 *   publish_limit    발행 한도    → PUBLISH_LIMIT_REACHED
 *   그 외             학생 한도    → STUDENT_LIMIT_REACHED
 *
 * 그런데 교수자 화면의 `resolveCodeGate` 는 발행 한도만 봤다. 학생 한도가
 * 꽉 차도 코드를 그대로 내보냈고, 교수자는 다 뿌린 뒤에야 학생들이 못
 * 들어온다는 걸 알았다. 코드는 한 번 나가면 회수할 수 없다.
 */
describe("코드 노출 게이트가 학생 한도를 본다", () => {
  describe("발행 한도에 여유가 있을 때", () => {
    const base = { publishesRemaining: 5 };

    it("학생 자리도 넉넉하면 연다", () => {
      expect(resolveCodeGate({ ...base, studentsRemaining: 30 })).toBe("open");
    });

    it("학생 자리가 얼마 안 남으면 경고한다", () => {
      // 뿌린 뒤에 막히면 늦다. 뿌리기 전에 알아야 한다.
      expect(resolveCodeGate({ ...base, studentsRemaining: 3 })).toBe("warning");
    });

    it("학생 자리가 없으면 막는다", () => {
      // 뿌려도 아무도 못 들어온다. 코드를 내보내는 게 오히려 해롭다.
      expect(resolveCodeGate({ ...base, studentsRemaining: 0 })).toBe("blocked");
    });
  });

  describe("이미 발행한 시험", () => {
    // 발행 한도는 다시 적용되지 않는다(`first_published_at IS NOT NULL`).
    // 하지만 학생 한도는 계속 적용된다.
    it("학생 자리가 없으면 막는다", () => {
      expect(
        resolveCodeGate({
          alreadyPublished: true,
          publishesRemaining: 0,
          studentsRemaining: 0,
        })
      ).toBe("blocked");
    });

    it("학생 자리가 있으면 연다", () => {
      expect(
        resolveCodeGate({
          alreadyPublished: true,
          publishesRemaining: 0,
          studentsRemaining: 20,
        })
      ).toBe("open");
    });
  });

  describe("한도를 모르는 경우", () => {
    it("무제한이면 연다", () => {
      expect(
        resolveCodeGate({ publishesRemaining: null, studentsRemaining: null })
      ).toBe("open");
    });

    it("값이 없으면 막지 않는다", () => {
      // 조회 실패와 '자리 없음' 은 다르다. 모르면 안 막는다.
      expect(resolveCodeGate({ publishesRemaining: 5 })).toBe("open");
      expect(resolveCodeGate(undefined)).toBe("open");
    });
  });

  describe("데모", () => {
    it("한도를 소모하지 않으므로 항상 연다", () => {
      expect(
        resolveCodeGate({ isDemo: true, publishesRemaining: 0, studentsRemaining: 0 })
      ).toBe("open");
    });
  });

  describe("발행 한도가 먼저다", () => {
    it("발행이 막히면 학생 자리가 남아도 막는다", () => {
      expect(resolveCodeGate({ publishesRemaining: 0, studentsRemaining: 100 })).toBe(
        "blocked"
      );
    });
  });
});

describe("쿼터 API 가 학생 한도를 내보낸다", () => {
  it("응답에 studentsRemaining 이 있다", () => {
    // 화면이 볼 수 없으면 게이트도 판정할 수 없다.
    const src = read("app/api/instructor/quota/route.ts");
    expect(src, "학생 잔여를 안 내보낸다").toMatch(/studentsRemaining/);
  });

  it("판정 불능은 null 로 답한다", () => {
    // fail-open. 한도 계산 장애로 수업이 멈추면 안 된다.
    const src = read("app/api/instructor/quota/route.ts");
    expect(src).toMatch(/studentsRemaining: null/);
  });
});

describe("화면이 그 값을 실제로 받는다", () => {
  it("쿼터 응답 타입을 한 곳에서만 선언한다", () => {
    // 네 화면이 각자 인라인으로 선언하고 있었다. 한 곳에 필드를 더해도
    // 나머지가 모르면 게이트가 판정할 값을 못 받는다.
    const files = [
      "app/(app)/instructor/assignment/new/page.tsx",
      "app/(app)/instructor/new/page.tsx",
      "app/(app)/instructor/[examId]/page.tsx",
      "components/instructor/InstructorHomeClient.tsx",
    ];
    const inline = files.filter((f) =>
      /\{ publishesRemaining: number \| null \}/.test(read(f))
    );
    expect(inline, ).toHaveLength(0);
  });

  it("시험 상세가 실제 학생 수로 잔여를 계산한다", () => {
    // 플랜 상한만 넘기면 이미 30명 받은 시험도 "30자리 남음" 이 된다.
    const src = read("app/(app)/instructor/[examId]/page.tsx");
    expect(src).toMatch(/studentsRemaining:/);
    expect(src, "실제 학생 수를 빼지 않는다").toMatch(/bulkGradeStatus\?\.studentCount/);
  });
});
