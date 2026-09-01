import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildStudentNotice, studentNoticePolicyLines } from "@/lib/student-notice";

const root = process.cwd();
const readJson = (locale: "ko" | "en", file: string) =>
  JSON.parse(readFileSync(path.join(root, "messages", locale, file), "utf8")) as Record<string, unknown>;
const exam = {
  ko: readJson("ko", "exam.json") as { preflight: Record<string, string> },
  en: readJson("en", "exam.json") as { preflight: Record<string, string> },
};
const instructor = {
  ko: readJson("ko", "instructor.json") as { drive: Record<string, string> },
  en: readJson("en", "instructor.json") as { drive: Record<string, string> },
};
const authoring = {
  ko: readJson("ko", "authoring.json") as { examDetailsCard: Record<string, string> },
  en: readJson("en", "authoring.json") as { examDetailsCard: Record<string, string> },
};
const preflightSource = readFileSync(
  path.join(root, "components", "exam", "PreflightModal.tsx"),
  "utf8"
);

const policyLines = (locale: "ko" | "en", aiChatAvailable: boolean) =>
  studentNoticePolicyLines(aiChatAvailable, {
    allowed: exam[locale].preflight.aiDisclosureAllowed,
    graded: exam[locale].preflight.aiDisclosureGraded,
    visible: exam[locale].preflight.aiDisclosureVisible,
    unavailable: exam[locale].preflight.aiDisclosureUnavailable,
    externalAiProhibited: exam[locale].preflight.aiDisclosureExternalAiProhibited,
    activityRecorded: exam[locale].preflight.aiDisclosureActivityRecorded,
  });

describe("AI 고지 적용 범위 (#325)", () => {
  it("AI 채팅이 없는 시험도 빈 정책 대신 AI 미제공 정책을 반환한다", () => {
    const lines = policyLines("ko", false);

    expect(lines).toEqual([
      exam.ko.preflight.aiDisclosureUnavailable,
      exam.ko.preflight.aiDisclosureExternalAiProhibited,
      exam.ko.preflight.aiDisclosureActivityRecorded,
    ]);
    expect(lines).not.toHaveLength(0);
  });

  it.each([true, false] as const)("AI 채팅 %s 여부와 관계없이 공지문에 제목, 코드, 정책을 넣는다", (aiChatAvailable) => {
    const lines = policyLines("en", aiChatAvailable);
    const notice = buildStudentNotice({
      heading: "[Quest-ON] Exam notice",
      examTitle: "Midterm",
      codeLabel: "Entry code",
      examCode: "MID01",
      policyLines: lines,
    });

    expect(notice).toContain("[Quest-ON] Exam notice");
    expect(notice).toContain("Midterm");
    expect(notice).toContain("Entry code: MID01");
    for (const line of lines) expect(notice).toContain(`- ${line}`);
  });

  it("AI 미제공 고지와 확인 문구가 ko/en 양쪽에 있다", () => {
    for (const locale of ["ko", "en"] as const) {
      for (const key of [
        "aiDisclosureUnavailable",
        "aiDisclosureExternalAiProhibited",
        "aiDisclosureActivityRecorded",
        "aiActivityCheckLabel",
      ]) {
        expect(exam[locale].preflight[key], `${locale}.exam.preflight.${key}`).toBeTruthy();
      }
    }
  });

  it("발행 한도 안내는 사유와 계정 인증 방법을 함께 설명한다", () => {
    for (const locale of ["ko", "en"] as const) {
      const messages = [
        instructor[locale].drive.toastExamCodeBlocked,
        authoring[locale].examDetailsCard.toastCodeBlocked,
      ];
      for (const message of messages) {
        expect(message).toMatch(locale === "ko" ? /학생.*교수자 계정.*오용/ : /students.*misusing.*instructor accounts/i);
        expect(message).toMatch(locale === "ko" ? /계정.*인증/ : /verify your account/i);
      }
    }
  });

  it("PreflightModal은 시험 유형과 무관하게 최초 고지를 게이팅한다", () => {
    expect(preflightSource).toMatch(/const showFirstRunAiConsent = showAiDisclosure;/);
    expect(preflightSource).not.toMatch(/const showFirstRunAiConsent = examHasEssay && showAiDisclosure;/);
    expect(preflightSource).toContain('t("preflight.aiDisclosureUnavailable")');
    expect(preflightSource).toMatch(
      /examHasEssay \? "preflight\.aiLogCheckLabel" : "preflight\.aiActivityCheckLabel"/
    );
  });

  it("AI 기록 고지를 한 화면에서 반복하지 않는다", () => {
    // 예전에는 같은 사실이 네 곳에 있었다: 요약 박스 · AI 사용 안내 ·
    // 별도 Alert · 확인 체크박스. 반복은 고지를 강하게 만들지 않고 희석시킨다.
    // 고지(AC-14)와 명시 확인(체크박스)만 남긴다.
    expect(preflightSource).not.toContain("preflight.aiLogAlertTitle");
    expect(preflightSource).not.toContain("preflight.aiActivityAlertTitle");

    // 재응시(고지 묶음을 안 보는 학생)에서는 요약 줄이 유일한 안내라 남아야 한다.
    expect(preflightSource).toMatch(/examHasEssay && !showFirstRunAiConsent/);
  });

  it("쓰이지 않게 된 Alert 문구 키를 메시지에 남기지 않는다", () => {
    for (const locale of ["ko", "en"] as const) {
      for (const key of [
        "aiLogAlertTitle",
        "aiLogAlertDescription",
        "aiActivityAlertTitle",
        "aiActivityAlertDescription",
      ]) {
        expect(
          exam[locale].preflight[key],
          `${locale}.exam.preflight.${key} 가 살아 있다`
        ).toBeUndefined();
      }
    }
  });
});
