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

  it("완주 상태 조회는 데모 상세에서만 활성화되고 개방 여부를 표시한다", () => {
    expect(page).toContain('fetch("/api/onboarding/demo/status", { signal })');
    expect(page).toContain("enabled: isDemoExam && isLoaded && !!isSignedIn");
    expect(page).toContain("demoStatus?.aiRegenerationUnlocked");
    expect(page).toContain('t("examDetail.demoAiRegenerationLockedDescription")');
    expect(page).toContain('t("examDetail.demoAiRegenerationUnlockedDescription")');
  });

  it("데모 안내 문구는 두 지원 언어에 모두 있다", () => {
    for (const messages of [koMessages, enMessages]) {
      expect(messages.examDetail).toMatchObject({
        tryAsStudent: expect.any(String),
        demoAiRegenerationLockedDescription: expect.any(String),
        demoAiRegenerationUnlockedDescription: expect.any(String),
      });
    }
  });
});
