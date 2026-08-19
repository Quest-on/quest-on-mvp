import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("데모 상세 CTA와 완주 상태", () => {
  const header = read("components/instructor/ExamDetailHeader.tsx");
  const page = read("app/(app)/instructor/[examId]/page.tsx");
  const hook = read("hooks/useExamDetail.ts");
  const handler = read("app/api/supa/handlers/exam-handlers.ts");
  const getExamById = handler.slice(handler.indexOf("export async function getExamById"));
  const koMessages = JSON.parse(read("messages/ko/instructor.json"));
  const enMessages = JSON.parse(read("messages/en/instructor.json"));

  it("데모일 때만 학생 시점 CTA를 시험 코드 경로로 보인다", () => {
    expect(header).toMatch(/isDemo\?: boolean/);
    expect(header).toMatch(/isDemo && demoPreviewLabel/);
    // 재응시 라벨이 있으면 `?restartDemo=1` 을 붙인다. 없으면 순수 응시 경로다.
    expect(header).toContain("`/exam/${code}?restartDemo=1`");
    expect(header).toContain("`/exam/${code}`");
    expect(page).toContain("isDemo={isDemoExam}");
    expect(page).toContain('demoPreviewLabel={t("examDetail.tryAsStudent")}');
  });

  it("기존 단건 상세 조회가 is_demo를 전달해 일반 시험 CTA를 막는다", () => {
    expect(getExamById).toMatch(/\.select\([\s\S]*?is_demo[\s\S]*?\)/);
    expect(hook).toContain("is_demo: examResult.exam.is_demo === true");
    expect(page).toContain("const isDemoExam = exam?.is_demo === true;");
  });

  it("데모만 종료 전에도 채점 결과를 열어 완주를 기록할 수 있다", () => {
    // 데모 채점 결과 조회가 완주 이벤트를 기록하므로 일반 시험의 종료 제약만 유지한다.
    expect(page).toContain('const canOpenGrading = exam?.status === "closed" || isDemoExam;');
    expect(page).toContain("canOpenGrading={canOpenGrading}");
  });

  it("완주 상태 조회는 데모 상세에서만 활성화된다", () => {
    expect(page).toContain('fetch("/api/onboarding/demo/status", { signal })');
    expect(page).toContain("enabled: isDemoExam && isLoaded && !!isSignedIn");
    // 결과는 "데모 다시 풀기" 버튼이 쓴다.
    expect(page).toContain("demoStatus?.completed");
  });

  it("AI 재생성 잠금 안내를 화면에 띄우지 않는다", () => {
    // 예전에는 "학생 시점에서 1문항에 답하고 AI 채점 결과를 열어보면
    // 데모 완주로 기록됩니다" 를 띄웠다. 두 가지가 잘못이었다.
    //
    //   AI 재생성 기능 자체가 아직 없다(#83 열림). 없는 기능의 잠금을 알렸다.
    //   "기록됩니다" 는 내부 계측을 사용자에게 노출한 문장이다.
    expect(page, "잠금 안내가 되살아났다").not.toMatch(/demoAiRegeneration/);
  });

  it("데모 안내 문구는 두 지원 언어에 모두 있다", () => {
    for (const messages of [koMessages, enMessages]) {
      expect(messages.examDetail).toMatchObject({
        tryAsStudent: expect.any(String),
        retryAsStudent: expect.any(String),
      });
      // 지운 문구가 메시지에만 남아 있으면 다시 붙이기 쉬워진다.
      expect(
        Object.keys(messages.examDetail).filter((k) =>
          k.startsWith("demoAiRegeneration")
        ),
        "쓰지 않는 잠금 문구가 남아 있다"
      ).toHaveLength(0);
    }
  });
});
