/**
 * 데모 재응시 진입 배선 (에픽 #79 P1).
 *
 * 서버에 `restartDemoAttempt` 계약을 만들어도 **클라이언트 진입점이 없으면
 * 도달 불가**다. 실제로 슬라이스 통합 시점에 서버만 있고 CTA·훅 전달·zod
 * 스키마가 전부 비어 있어서, 재응시가 조용히 무시되는 상태였다.
 *
 * 이 파일은 그 사슬(CTA → 쿼리 파라미터 → 훅 → zod → 서버)이 끊기지 않았는지
 * 고정한다. 한 칸만 빠져도 "데모 다시 해보기"가 아무 일도 안 하게 된다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (rel: string) =>
  readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("재응시 사슬이 끊기지 않았다", () => {
  const header = read("components/instructor/ExamDetailHeader.tsx");
  const detail = read("app/(app)/instructor/[examId]/page.tsx");
  const hook = read("hooks/useExamSession.ts");
  const validations = read("lib/validations.ts");
  const handlers = read("app/api/supa/handlers/session-handlers.ts");

  it("완주한 데모에서만 재응시 라벨을 넘긴다", () => {
    // 미완주 상태에서 재응시를 권하면 아직 만들지도 않은 결과를 지운다.
    expect(detail).toMatch(/demoStatus\?\.completed \? t\("examDetail\.retryAsStudent"\)/);
  });

  it("CTA 가 재응시 의도를 URL 로 실어 보낸다", () => {
    expect(header).toMatch(/restartDemo=1/);
    expect(header).toMatch(/demoRestartLabel \?\? demoPreviewLabel/);
  });

  it("훅이 그 파라미터를 읽어 서버로 전달한다", () => {
    expect(hook).toMatch(/searchParams\.get\("restartDemo"\) === "1"/);
    expect(hook).toMatch(/restartDemoAttempt: true/);
  });

  it("재응시 여부가 쿼리 키에 들어간다", () => {
    // 안 넣으면 같은 캐시를 재사용해 앞선 읽기 전용 응답이 그대로 돌아온다.
    expect(hook).toMatch(/queryKey: \["exam-session-init", examCode, user\?\.id, restartDemo\]/);
  });

  it("zod 스키마가 필드를 보존한다", () => {
    // 스키마에 없으면 zod 가 필드를 떨어뜨려 서버가 영영 못 받는다.
    expect(validations).toMatch(/restartDemoAttempt: z\.boolean\(\)\.optional\(\)/);
  });

  it("서버는 클라이언트 의도를 신뢰하지 않는다", () => {
    // 데모 소유자 판정이 함께 참일 때만 초기화해야 한다. 이 조건이 빠지면
    // 아무나 남의 시험 제출본을 지울 수 있다.
    expect(handlers).toMatch(
      /isDemoPreviewAttempt && data\.restartDemoAttempt === true/
    );
  });

  it("일반 학생의 제출 후 재응시 차단은 유지된다", () => {
    // 데모 예외가 일반 학생까지 열리면 제출한 시험을 다시 풀 수 있게 된다.
    expect(handlers).toMatch(/mostRecentSubmittedSession/);
  });

  it("재응시 라벨이 ko·en 모두 있다", () => {
    for (const loc of ["ko", "en"]) {
      const messages = JSON.parse(read(`messages/${loc}/instructor.json`));
      expect(messages.examDetail.retryAsStudent).toBeTruthy();
    }
  });
});
