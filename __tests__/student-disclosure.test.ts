/**
 * 학생 공지문과 AI 채팅 가용성 판정 (AC-14 / AC-16).
 *
 * 기대값이 한 번 뒤집혔다 (이슈 #325).
 *
 * 예전에는 "MCQ/OX 전용 시험은 정책 문구가 빈 배열" 을 고정했다. 그게 바로
 * #325 가 결함으로 지목한 동작이다 — 객관식 전용 시험의 공지문은 제목과 입장
 * 코드만 담겨 나가고, 학생은 AI 정책을 한 줄도 받지 못한 채 응시했다.
 *
 * 그렇다고 기존 3줄을 그대로 넣을 수도 없다. 채팅이 없는 시험에 "막히면
 * AI에게 질문하세요" 를 보내면 문구 자체가 거짓이 된다. 그래서 고지는 항상
 * 나가고 **내용만** 갈라진다(AI 제공 / AI 미제공 변형).
 *
 * 케이스를 지우지 않고 뒤집은 이유: 이 파일이 지키는 불변식은 "MCQ 면 빈
 * 배열" 가 아니라 **판정이 컴포넌트로 새어나가지 않는다**였고, 그건 여전히
 * 유효하다. 그래서 같은 지점을 새 기대값으로 계속 묶어 둔다.
 */
import { describe, expect, it } from "vitest";
import { buildStudentNotice, studentNoticePolicyLines } from "@/lib/student-notice";
import { hasAiChatQuestions } from "@/lib/grading-helpers";

const base = {
  heading: "[퀘스트온] 시험 안내",
  examTitle: "경영전략 중간고사",
  codeLabel: "입장 코드",
  examCode: "MATH01",
  policyLines: [
    "막히면 AI에게 질문하세요. 질문은 부정행위가 아니라 시험의 일부입니다.",
    "질문한 내용 자체도 평가 대상입니다.",
    "AI와 나눈 대화는 교수자에게 그대로 공개됩니다.",
  ],
};

describe("buildStudentNotice (AC-16)", () => {
  it("입장 코드를 반드시 포함한다 — 이게 없으면 공지문의 쓸모가 없다", () => {
    expect(buildStudentNotice(base)).toContain("MATH01");
  });

  it("시험 제목과 제목 줄을 포함한다", () => {
    const out = buildStudentNotice(base);
    expect(out).toContain("[퀘스트온] 시험 안내");
    expect(out).toContain("경영전략 중간고사");
  });

  it("AI 사용 안내 3줄을 전부 불릿으로 넣는다", () => {
    const out = buildStudentNotice(base);
    for (const line of base.policyLines) {
      expect(out).toContain(`- ${line}`);
    }
  });

  it("평문이다 — 마크다운 강조 문법을 쓰지 않는다", () => {
    // 교수자가 쓰는 채널(LMS/카톡/이메일)이 서식을 다르게 처리하므로
    // ** 같은 게 섞이면 어딘가에서는 그대로 보인다.
    expect(buildStudentNotice(base)).not.toMatch(/\*\*|__|^#/m);
  });

  it("제목이 비어도 코드 줄은 살아남는다", () => {
    const out = buildStudentNotice({ ...base, examTitle: "   " });
    expect(out).toContain("입장 코드: MATH01");
    expect(out).not.toMatch(/^\s+$/m.source ? /^ {3,}$/m : /$^/);
  });

  it("빈 안내 문장은 걸러내고 불릿을 만들지 않는다", () => {
    const out = buildStudentNotice({
      ...base,
      policyLines: ["첫 줄", "   ", ""],
    });
    expect(out).toContain("- 첫 줄");
    expect(out).not.toContain("- \n");
    expect(out.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(1);
  });

  it("footer 가 있으면 마지막에 붙고, 없으면 붙지 않는다", () => {
    const withFooter = buildStudentNotice({ ...base, footer: "문의는 담당 교수자에게." });
    expect(withFooter.trim().endsWith("문의는 담당 교수자에게.")).toBe(true);

    const withoutFooter = buildStudentNotice(base);
    expect(withoutFooter.trim().endsWith("공개됩니다.")).toBe(true);
  });

  it("안내 문장이 하나도 없으면 불릿 구획 자체를 만들지 않는다", () => {
    const out = buildStudentNotice({ ...base, policyLines: [] });
    expect(out).not.toContain("- ");
    expect(out).toContain("입장 코드: MATH01");
  });

  // #325: MCQ/OX 전용 시험에는 채팅을 권하지 않되, AI 미제공·외부 AI 금지·기록
  // 범위를 알려야 한다. 정책 자체를 빼면 첫 시험의 확인이 빈 껍데기가 된다.
  it("AI 채팅이 없는 시험 공지문도 정확한 정책 문구를 포함한다", () => {
    const out = buildStudentNotice({
      ...base,
      policyLines: ["AI 채팅은 제공되지 않습니다.", "외부 AI 사용은 허용되지 않습니다."],
    });

    expect(out).toContain("AI 채팅은 제공되지 않습니다.");
    expect(out).toContain("외부 AI 사용은 허용되지 않습니다.");
    expect(out).toContain("경영전략 중간고사");
    expect(out).toContain("입장 코드: MATH01");
  });

  it("결과는 항상 문자열이며 후행 공백 줄로 끝나지 않는다", () => {
    const out = buildStudentNotice(base);
    expect(typeof out).toBe("string");
    expect(out.endsWith("\n")).toBe(false);
  });
});

/**
 * 고지·공지문을 켤지 끌지 정하는 판정 자체.
 *
 * 리뷰 P2 2건의 공통 원인은 "학생 화면에는 채팅이 없는데 문구는 있다" 였다.
 * 학생 페이지(examHasEssay)와 교수자 상세 페이지(aiChatAvailable)가 같은 식을
 * 각자 들고 있으면 한쪽만 고쳐졌을 때 다시 어긋난다. 그래서 판정을 이 헬퍼
 * 하나로 모았고, 여기서 계약을 고정한다.
 */
describe("hasAiChatQuestions — AI 채팅 노출 판정 (리뷰 P2 공통 원인)", () => {
  it("서술형/CASE 가 하나라도 있으면 true — 그 문항에서 채팅이 뜬다", () => {
    expect(hasAiChatQuestions([{ type: "essay" }])).toBe(true);
    expect(hasAiChatQuestions([{ type: "case" }])).toBe(true);
    expect(hasAiChatQuestions([{ type: "short-answer" }])).toBe(true);
    expect(
      hasAiChatQuestions([{ type: "multiple-choice" }, { type: "essay" }])
    ).toBe(true);
  });

  it("MCQ/OX 전용 시험은 false — 학생 화면에 채팅이 아예 없다", () => {
    expect(
      hasAiChatQuestions([{ type: "multiple-choice" }, { type: "true-false" }])
    ).toBe(false);
  });

  it("문항이 비었거나 아직 안 왔으면 false — 확인 못 한 걸 고지하지 않는다", () => {
    expect(hasAiChatQuestions([])).toBe(false);
    expect(hasAiChatQuestions(undefined)).toBe(false);
    expect(hasAiChatQuestions(null)).toBe(false);
  });

  it("깨진 항목이 섞여도 던지지 않는다", () => {
    expect(hasAiChatQuestions([null, undefined])).toBe(false);
    expect(hasAiChatQuestions([null, { type: "essay" }])).toBe(true);
  });

  it("타입이 없는 문항은 채점 대상 서술형으로 본다 — 기존 판정과 동일", () => {
    // isObjectiveQuestion(undefined) === false 이므로 !objective = true.
    // 문항 타입이 유실됐을 때 채팅이 뜨는 쪽이 기존 학생 화면 동작이다.
    expect(hasAiChatQuestions([{}])).toBe(true);
  });
});

/**
 * 카드가 실제로 복사하는 문자열의 AI 문구 포함 여부.
 *
 * 이전 테스트는 `policyLines: []` 를 테스트가 직접 넘겨서, 카드가 다시 무조건
 * AI 문구를 넣도록 되돌아가도 통과했다. 판정을 순수 함수로 빼고 그 함수 +
 * 조립 결과를 함께 고정한다 (ExamDetailsCard 는 이 함수만 호출한다).
 */
describe("studentNoticePolicyLines + 최종 복사 문자열", () => {
  const t = {
    allowed: "막히면 AI에게 질문하세요. 질문은 부정행위가 아니라 시험의 일부입니다.",
    graded: "질문한 내용 자체도 평가 대상입니다.",
    visible: "AI와 나눈 대화는 교수자에게 그대로 공개됩니다.",
    unavailable: "AI 채팅은 제공되지 않습니다.",
    externalAiProhibited: "외부 AI 사용은 허용되지 않습니다.",
    activityRecorded: "시험 활동은 기록됩니다.",
  };

  it("AI 채팅이 있으면 안내 3줄을 순서대로 넣는다", () => {
    expect(studentNoticePolicyLines(true, t)).toEqual([
      t.allowed,
      t.graded,
      t.visible,
    ]);
  });

  it("AI 채팅이 없으면 AI 미제공 정책 3줄을 넣는다", () => {
    expect(studentNoticePolicyLines(false, t)).toEqual([
      t.unavailable,
      t.externalAiProhibited,
      t.activityRecorded,
    ]);
  });

  it("객관식 전용 시험에서 복사되는 문자열에는 AI 미제공 정책이 있다", () => {
    const notice = buildStudentNotice({
      ...base,
      policyLines: studentNoticePolicyLines(false, t),
    });

    expect(notice).toContain(`- ${t.unavailable}`);
    expect(notice).toContain(`- ${t.externalAiProhibited}`);
    expect(notice).toContain(`- ${t.activityRecorded}`);
    expect(notice).toContain("입장 코드: MATH01");
  });

  it("서술형이 있는 시험에서 복사되는 문자열에는 AI 문구 3줄이 있다", () => {
    const notice = buildStudentNotice({
      ...base,
      policyLines: studentNoticePolicyLines(true, t),
    });

    expect(notice).toContain(`- ${t.allowed}`);
    expect(notice).toContain(`- ${t.graded}`);
    expect(notice).toContain(`- ${t.visible}`);
  });
});
