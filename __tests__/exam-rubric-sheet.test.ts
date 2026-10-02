/**
 * 응시 화면에서 교수자가 공개한 평가 기준(루브릭)을 읽기 전용으로 본다 (이슈 #512).
 *
 * 2026-05-20 루브릭 기능을 걷어낼 때 학생 화면의 표시도 함께 사라졌다. 교수자가
 * `rubric_public` 을 켜도 학생은 무엇으로 평가받는지 시험 중에 볼 곳이 없었다.
 *
 * 렌더 방식: 이 저장소에는 `@testing-library/*`·`jsdom` 이 없다. 그래서 기존
 * 렌더 테스트(`password-reset-recovery-page.test.ts`)처럼 `react-dom/server` 로
 * 렌더한다. next-intl 훅이 있으므로 실제 ko/en 메시지를 넣은 Provider 로 감싼다.
 *
 * 한계: Radix 의 시트 내용은 Portal 이라 서버 렌더에서는 비어 있다(닫힌 상태와
 * 같다). 그래서 시트 안쪽 목록은 `RubricList` 를 따로 렌더해 보고, 시트가 그 목록을
 * 스크롤 영역에 담아 쓰는지는 소스로 고정한다. 열고 닫는 동작은 브라우저의 몫이다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import koExam from "../messages/ko/exam.json";
import enExam from "../messages/en/exam.json";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

type Locale = "ko" | "en";

function withIntl(locale: Locale, node: ReactElement): string {
  const messages = { exam: locale === "ko" ? koExam : enExam };
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages, timeZone: "Asia/Seoul", children: node }),
  );
}

const ITEMS = [
  { id: "r1", evaluationArea: "문제 이해", detailedCriteria: "문제의 핵심 쟁점을 정확히 파악했는가" },
  { id: "r2", evaluationArea: "근거 제시", detailedCriteria: "주장을 뒷받침하는 근거를 들었는가\n출처를 밝혔는가" },
];

const BUTTON_KO = 'aria-label="평가 기준 보기"';
const BUTTON_EN = 'aria-label="View evaluation criteria"';

describe("getPublicRubricItems — 학생에게 보여 줄 항목만 고른다", () => {
  async function pick(rubric: unknown, rubricPublic: unknown) {
    const { getPublicRubricItems } = await import("@/lib/exam-rubric");
    return getPublicRubricItems(rubric, rubricPublic);
  }

  it("rubric_public 이 true 이고 항목이 있는 배열이면 그 항목을 돌려준다", async () => {
    const items = await pick(ITEMS, true);
    expect(items.map((i) => i.evaluationArea)).toEqual(["문제 이해", "근거 제시"]);
  });

  it("rubric_public 이 true 가 아니면 비운다 (false / null / undefined / 'true')", async () => {
    for (const flag of [false, null, undefined, "true", 1]) {
      expect(await pick(ITEMS, flag), `rubric_public=${String(flag)}`).toEqual([]);
    }
  });

  it("배열이 아니면 비운다 (null / 문자열 / 객체 — 과거 데모 템플릿은 문자열이다)", async () => {
    for (const rubric of [null, undefined, "정확성, 논리성", { evaluationArea: "a" }, 3]) {
      expect(await pick(rubric, true), JSON.stringify(rubric)).toEqual([]);
    }
  });

  it("빈 배열이면 비운다", async () => {
    expect(await pick([], true)).toEqual([]);
  });

  it("모양이 깨진 항목과 빈 항목은 거른다", async () => {
    const items = await pick(
      [
        null,
        "문자열 항목",
        { evaluationArea: "", detailedCriteria: "  " },
        { evaluationArea: 3, detailedCriteria: {} },
        { evaluationArea: "논리성", detailedCriteria: "" },
        { evaluationArea: "", detailedCriteria: "근거가 있는가" },
      ],
      true,
    );
    expect(items).toEqual([
      { evaluationArea: "논리성", detailedCriteria: "" },
      { evaluationArea: "", detailedCriteria: "근거가 있는가" },
    ]);
  });

  it("깨진 항목뿐이면 비운다 — 버튼이 빈 시트를 열지 않게", async () => {
    expect(await pick([null, 3, { evaluationArea: " ", detailedCriteria: " " }], true)).toEqual([]);
  });
});

describe("RubricSheet — 버튼은 볼 기준이 있을 때만 있다", () => {
  async function render(locale: Locale, props: { rubric?: unknown; rubricPublic?: boolean | null }) {
    const { RubricSheet } = await import("@/components/exam/RubricSheet");
    return withIntl(locale, createElement(RubricSheet, props));
  }

  it("rubric_public true + 항목 배열 → 평가 기준 버튼이 보이고 시트를 여는 버튼이다", async () => {
    const html = await render("ko", { rubric: ITEMS, rubricPublic: true });
    expect(html).toContain("<button");
    expect(html).toContain(BUTTON_KO);
    expect(html).toContain("평가 기준");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("rubric_public 이 false 이면 버튼이 없다", async () => {
    expect(await render("ko", { rubric: ITEMS, rubricPublic: false })).toBe("");
  });

  it("rubric_public 이 null / 미지정이면 버튼이 없다", async () => {
    expect(await render("ko", { rubric: ITEMS, rubricPublic: null })).toBe("");
    expect(await render("ko", { rubric: ITEMS })).toBe("");
  });

  it("rubric 이 null / 문자열 / 빈 배열이면 버튼이 없다", async () => {
    expect(await render("ko", { rubric: null, rubricPublic: true })).toBe("");
    expect(await render("ko", { rubric: "정확성, 논리성", rubricPublic: true })).toBe("");
    expect(await render("ko", { rubric: [], rubricPublic: true })).toBe("");
  });

  it("영어 화면이면 버튼 문구가 영어다", async () => {
    const html = await render("en", { rubric: ITEMS, rubricPublic: true });
    expect(html).toContain(BUTTON_EN);
    expect(html).toContain("Evaluation criteria");
    expect(html).not.toContain("평가 기준");
  });
});

describe("RubricList — 시트 안에서 항목을 읽기 전용으로 나열한다", () => {
  async function renderList(locale: Locale, items: Array<{ evaluationArea: string; detailedCriteria: string }>) {
    const { RubricList } = await import("@/components/exam/RubricSheet");
    return withIntl(locale, createElement(RubricList, { items }));
  }

  it("평가 영역과 세부 기준을 항목마다 보여 준다", async () => {
    const html = await renderList("ko", ITEMS);
    expect(html).toContain("문제 이해");
    expect(html).toContain("문제의 핵심 쟁점을 정확히 파악했는가");
    expect(html).toContain("근거 제시");
    expect(html).toContain("주장을 뒷받침하는 근거를 들었는가");
    expect((html.match(/<li\b/g) ?? []).length).toBe(2);
  });

  it("읽기 전용이다 — 입력 요소가 없다", async () => {
    const html = await renderList("ko", ITEMS);
    expect(html).not.toMatch(/<(input|textarea|select|button)\b/);
  });

  it("세부 기준의 줄바꿈을 살리고, 긴 단어도 넘치지 않게 한다", async () => {
    const html = await renderList("ko", ITEMS);
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("break-words");
  });

  it("스크립트 문자열은 이스케이프된다 (HTML 로 해석하지 않는다)", async () => {
    const html = await renderList("ko", [
      { evaluationArea: "<img src=x onerror=alert(1)>", detailedCriteria: "<script>alert(1)</script>" },
    ]);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("항목이 7개 이상이어도 모두 나열한다", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      evaluationArea: `영역 ${i + 1}`,
      detailedCriteria: `세부 기준 ${i + 1} `.repeat(30),
    }));
    const html = await renderList("ko", many);
    expect((html.match(/<li\b/g) ?? []).length).toBe(9);
    expect(html).toContain("영역 9");
  });
});

describe("RubricSheet 구조 — 스크롤, 접근성, 문구", () => {
  const sheetSource = () => read("components/exam/RubricSheet.tsx");

  it("제목과 설명을 시트 접근성 이름으로 쓴다", () => {
    const source = sheetSource();
    expect(source).toContain("<SheetTitle");
    expect(source).toContain("<SheetDescription");
    expect(source).toContain('t("rubric.title")');
    expect(source).toContain('t("rubric.description")');
  });

  it("목록은 스크롤 영역 안에 있고 머리말과 닫기 버튼은 스크롤에서 빠진다", () => {
    const source = sheetSource();
    expect(source).toMatch(/overflow-y-auto/);
    expect(source).toMatch(/min-h-0/);
    expect(source).toMatch(/<RubricList\b/);
    expect(source).toContain("<SheetClose");
  });

  it("목록은 문제 본문처럼 CopyProtector 안에 있다 (복사해도 외부 붙여넣기로 오인되지 않는다)", () => {
    const source = sheetSource();
    expect(source).toMatch(/<CopyProtector>\s*<RubricList\b/);
  });

  it("좁은 화면에서는 시트가 화면 너비를 채운다", () => {
    const source = sheetSource();
    expect(source).toMatch(/\bw-full\b/);
  });

  it("버튼 라벨은 좁은 화면에서 아이콘만 남기고, aria-label 은 항상 있다", () => {
    const source = sheetSource();
    expect(source).toContain('t("rubric.buttonAriaLabel")');
    expect(source).toMatch(/hidden sm:inline/);
  });

  it("한국어/영어 문구를 하드코딩하지 않는다", () => {
    const source = sheetSource();
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(stripped).not.toMatch(/[가-힣]/);
  });
});

describe("메시지 — ko/en 키가 같고 비어 있지 않다", () => {
  const keys = ["button", "buttonAriaLabel", "title", "description", "close"] as const;

  for (const [locale, messages] of [["ko", koExam], ["en", enExam]] as const) {
    it(`${locale}: exam.rubric 의 문구가 모두 있다`, () => {
      const rubric = (messages as unknown as { rubric?: Record<string, string> }).rubric;
      expect(rubric, `${locale} exam.rubric 가 없다`).toBeTruthy();
      for (const key of keys) {
        expect(typeof rubric?.[key], `${locale} exam.rubric.${key}`).toBe("string");
        expect(rubric?.[key]?.trim().length, `${locale} exam.rubric.${key}`).toBeGreaterThan(0);
      }
    });
  }

  it("교수자 안내는 '읽기 전용' 임을 말한다", () => {
    expect((koExam as unknown as { rubric: { description: string } }).rubric.description).toContain("읽기 전용");
    expect((enExam as unknown as { rubric: { description: string } }).rubric.description.toLowerCase()).toContain(
      "read-only",
    );
  });
});

describe("ExamCenterToolbar — 평가 기준 버튼 배치", () => {
  async function renderToolbar(
    locale: Locale,
    extra: { rubric?: unknown; rubricPublic?: boolean | null; showQuestionToggle?: boolean },
  ) {
    const { ExamCenterToolbar } = await import("@/components/exam/ExamCenterToolbar");
    return withIntl(
      locale,
      createElement(ExamCenterToolbar, {
        examTitle: "중간 모의시험",
        duration: 0,
        onSubmit: () => {},
        isSubmitting: false,
        ...extra,
      }),
    );
  }

  it("공개된 기준이 있으면 도구 막대에 평가 기준 버튼이 있다", async () => {
    const html = await renderToolbar("ko", { rubric: ITEMS, rubricPublic: true, showQuestionToggle: true });
    expect(html).toContain(BUTTON_KO);
    // 문제 보기 토글 옆(같은 왼쪽 묶음) — 제목보다 앞이다
    expect(html.indexOf(BUTTON_KO)).toBeLessThan(html.indexOf("중간 모의시험"));
    expect(html.indexOf("문제 접기")).toBeLessThan(html.indexOf(BUTTON_KO));
  });

  it("문제 보기 토글이 없는 객관식 화면에서도 버튼이 있다", async () => {
    const html = await renderToolbar("ko", { rubric: ITEMS, rubricPublic: true, showQuestionToggle: false });
    expect(html).toContain(BUTTON_KO);
  });

  it("공개되지 않았거나 기준이 없으면 버튼이 없고 나머지 도구 막대는 그대로다", async () => {
    for (const extra of [
      { rubric: ITEMS, rubricPublic: false },
      { rubric: ITEMS, rubricPublic: null },
      { rubric: null, rubricPublic: true },
      { rubric: "정확성", rubricPublic: true },
      { rubric: [], rubricPublic: true },
      {},
    ]) {
      const html = await renderToolbar("ko", extra);
      expect(html, JSON.stringify(extra)).not.toContain("평가 기준");
      expect(html).toContain("시험 제출하기");
      expect(html).toContain("중간 모의시험");
    }
  });

  it("영어 화면이면 영어 버튼이다", async () => {
    const html = await renderToolbar("en", { rubric: ITEMS, rubricPublic: true });
    expect(html).toContain(BUTTON_EN);
  });
});

describe("응시 페이지 배선", () => {
  const page = () => read("app/(app)/exam/[code]/page.tsx");
  const hook = () => read("hooks/useExamSession.ts");

  it("페이지의 Exam 타입이 rubric / rubric_public 을 담는다", () => {
    const src = page();
    const iface = src.slice(src.indexOf("interface Exam {"), src.indexOf("function isHtmlEmpty"));
    expect(iface).toMatch(/\brubric\?:/);
    expect(iface).toMatch(/\brubric_public\?:/);
  });

  it("도구 막대에 시험의 rubric 과 rubric_public 을 그대로 넘긴다", () => {
    const src = page();
    const toolbar = src.slice(src.indexOf("<ExamCenterToolbar"), src.indexOf("<MainContentWrapper>"));
    expect(toolbar).toMatch(/rubric=\{exam\.rubric\}/);
    expect(toolbar).toMatch(/rubricPublic=\{exam\.rubric_public\}/);
  });

  it("훅의 Exam 타입은 이미 rubric 을 가진다 — 서버 응답 모양을 그대로 받는다", () => {
    const src = hook();
    expect(src).toMatch(/rubric\?:/);
    expect(src).toMatch(/rubric_public\?:/);
  });

  it("대기실은 건드리지 않는다 (범위 밖)", () => {
    expect(read("components/exam/WaitingRoom.tsx")).not.toMatch(/rubric/i);
  });
});
