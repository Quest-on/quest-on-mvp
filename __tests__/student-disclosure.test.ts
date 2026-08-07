import { describe, expect, it } from "vitest";
import { buildStudentNotice } from "@/lib/student-notice";

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

  // 리뷰 P2: MCQ/OX 전용 시험은 학생 화면에 AI 채팅이 렌더되지 않는다
  // (exam/[code]/page.tsx 가 !isCurrentObjective 일 때만 ExamChatSidebar 노출).
  // ExamDetailsCard 는 aiChatAvailable=false 일 때 policyLines 를 [] 로 넘기며,
  // 그 결과 공지문에 "AI에게 질문하세요" 류가 한 줄도 들어가지 않아야 한다.
  it("AI 채팅이 없는 시험의 공지문에는 AI 안내가 한 줄도 없다", () => {
    const out = buildStudentNotice({ ...base, policyLines: [] });

    expect(out).not.toMatch(/AI/);
    expect(out).not.toContain("질문");
    // 그래도 공지문으로서 최소한의 쓸모(제목·입장 코드)는 유지된다.
    expect(out).toContain("경영전략 중간고사");
    expect(out).toContain("입장 코드: MATH01");
  });

  it("결과는 항상 문자열이며 후행 공백 줄로 끝나지 않는다", () => {
    const out = buildStudentNotice(base);
    expect(typeof out).toBe("string");
    expect(out.endsWith("\n")).toBe(false);
  });
});
