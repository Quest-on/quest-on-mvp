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
    // #174 로 재응시가 확인 다이얼로그를 거친다. URL 은 확인 시 router.push
    // 로 나간다 — 의도(restartDemo=1 전달)는 그대로다. 삭제가 아니라 이동이다.
    expect(header).toMatch(/restartDemo=1/);
    expect(header).toMatch(/router\.push\(`\/exam\/\$\{code\}\?restartDemo=1`\)/);
  });

  it("재응시가 무엇을 지우는지 누르기 전에 알린다", () => {
    // 서버는 이전 제출·채점·대화를 실제로 삭제한다(UNIQUE(exam_id, student_id)
    // 아래 새 세션을 못 만들기 때문이다). 라벨만 있고 경고가 없으면 사용자는
    // 되돌릴 수 없는 삭제를 모르고 누른다.
    expect(header).toMatch(/demoRestartHint\?: string/);
    expect(header).toMatch(/demoRestartLabel && demoRestartHint/);
    expect(detail).toMatch(/demoRestartHint=\{/);

    for (const loc of ["ko", "en"]) {
      const messages = JSON.parse(read(`messages/${loc}/instructor.json`));
      expect(messages.examDetail.retryAsStudentHint).toBeTruthy();
    }
  });

  it("경고 문구가 삭제 사실을 실제로 말한다", () => {
    const ko = JSON.parse(read("messages/ko/instructor.json"));
    const en = JSON.parse(read("messages/en/instructor.json"));
    // "다시 풀 수 있습니다" 같은 무해한 문구로 바뀌면 경고가 아니다.
    expect(ko.examDetail.retryAsStudentHint).toMatch(/사라|삭제|지워/);
    expect(en.examDetail.retryAsStudentHint).toMatch(/clear|delete|erase|lose/i);
  });


  it("훅이 그 파라미터를 읽어 서버로 전달한다", () => {
    expect(hook).toMatch(/searchParams\.get\("restartDemo"\) === "1"/);
    expect(hook).toMatch(/restartDemoAttempt: true/);
  });

  it("재응시 여부가 쿼리 키에 들어간다", () => {
    // 안 넣으면 같은 캐시를 재사용해 앞선 읽기 전용 응답이 그대로 돌아온다.
    // 키가 qk 로 옮겨졌다(#301 후속). 계약은 그대로 - restartDemo 가 키에 들어간다.
    expect(hook).toMatch(/qk\.session\.init\(examCode, user\?\.id, restartDemo\)/);
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

describe("원자적 초기화 (023)", () => {
  const sql = read("database/023_restart_demo_attempt.sql");

  it("함수가 데모·소유자를 스스로 다시 확인한다", () => {
    // 애플리케이션이 이미 판정했더라도 이게 유일한 삭제 경로여야 한다.
    expect(sql).toMatch(/e\.is_demo = true/);
    expect(sql).toMatch(/e\.instructor_id::text = p_user_id/);
  });

  it("세션 행을 잠근다", () => {
    // 두 탭이 동시에 누르면 한쪽이 지우는 중 다른 쪽이 초기화해
    // 반쯤 지워진 시도가 남는다.
    expect(sql).toMatch(/FOR UPDATE/);
  });

  it("제출된 시도가 없으면 아무것도 지우지 않는다", () => {
    // 푸는 중인 세션을 지우면 새로고침만으로 작성 중인 답안이 날아간다.
    expect(sql).toMatch(/s\.submitted_at IS NOT NULL/);
  });

  it("시도 종속 데이터를 전부 지운다", () => {
    // 하나라도 남으면 새 시도 화면에 이전 흔적이 섞여 나온다.
    for (const table of [
      "grades",
      "grading_chats",
      "messages",
      "submissions",
      "session_quiz_attempts",
      "paste_logs",
    ]) {
      expect(sql).toMatch(
        new RegExp(`DELETE FROM public\\.${table} WHERE session_id = v_session_id;`)
      );
    }
  });

  it("완주 마일스톤과 AI 비용은 지우지 않는다", () => {
    // 완주는 특정 시도가 아니라 사람 단위 사실이고, ai_events 는 실제로
    // 발생한 비용이라 감사 대상이다.
    expect(sql).not.toMatch(/DELETE FROM public\.onboarding_events/);
    expect(sql).not.toMatch(/DELETE FROM public\.ai_events/);
  });

  it("권한이 service_role 로 좁혀져 있다", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.restart_demo_attempt\(uuid, text\) FROM anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.restart_demo_attempt\(uuid, text\) TO service_role;/);
  });

  it("CI 가 이 마이그레이션을 적용한다", () => {
    const setup = read(".github/actions/test-setup/action.yml");
    expect(setup).toMatch(/database\/023_restart_demo_attempt\.sql/);
  });
});
