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
 * 시트 안쪽: Radix 의 `Portal` 은 서버 렌더에서 `null` 이다(`document` 가 없어
 * 컨테이너를 못 찾는다). 그대로 두면 열린 시트도 마크업이 비어서, 시트 안쪽을
 * 렌더로는 아무것도 못 본다. 그래서 이 파일에서만 `Portal` 을 "자식을 그 자리에
 * 그대로 그린다" 로 바꾸고(아래 vi.mock), `defaultOpen` 으로 연 시트를 렌더한다.
 * 나머지 Radix(Root, Content, Title, Trigger)는 실제 코드다.
 *
 * 한계: 열고 닫는 동작(클릭, Esc, 포커스 이동), 실제 스크롤, 좁은 화면 배치는
 * 브라우저의 몫이다. 여기서는 "열렸을 때 무엇이 그려지는가" 까지만 본다.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import koExam from "../messages/ko/exam.json";
import enExam from "../messages/en/exam.json";

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  const { createElement: h, Fragment } = await import("react");
  return {
    ...actual,
    Portal: ({ children }: { children?: ReactNode }) => h(Fragment, null, children),
  };
});

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
const BUTTON_EN = 'aria-label="View rubric"';

/** 영어 화면용 항목 — 한글이 섞이면 "ko 전용 문구가 새는지" 를 한글 검사로 잡을 수 있다. */
const ITEMS_EN = [
  { id: "e1", evaluationArea: "Understanding the problem", detailedCriteria: "Identifies the core issue accurately" },
  { id: "e2", evaluationArea: "Use of evidence", detailedCriteria: "Supports claims with evidence\nCites sources" },
];

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
    expect(html).toContain(">Rubric</span>");
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

  it("글자 크기는 디자인 시스템 클래스(type-field-label, type-hint)로 정한다", async () => {
    const html = await renderList("ko", ITEMS);
    expect(html).toMatch(/<h3 class="[^"]*\btype-field-label\b/);
    expect(html).toMatch(/<p class="[^"]*\btype-hint\b/);
    expect(html).not.toMatch(/\btext-sm\b/);
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

/** 평가 기준 시트가 쓰는 메시지 키 전부. 키를 더하거나 빼면 이 목록과 소스·ko·en 이 함께 바뀌어야 한다. */
const SHEET_KEYS = ["button", "buttonAriaLabel", "title", "description", "close"] as const;

function rubricMessages(locale: Locale): Record<string, string> {
  const messages = (locale === "ko" ? koExam : enExam) as unknown as { rubric: Record<string, string> };
  return messages.rubric;
}

describe("메시지 — 시트가 쓰는 키 전부가 ko/en 에 있다", () => {
  it("소스가 t('rubric.*') 로 부르는 키는 SHEET_KEYS 와 정확히 같다 (빠지거나 남지 않는다)", () => {
    const source = read("components/exam/RubricSheet.tsx");
    const used = [...source.matchAll(/\bt\("rubric\.([A-Za-z]+)"\)/g)].map((m) => m[1]);
    expect([...new Set(used)].sort()).toEqual([...SHEET_KEYS].sort());
  });

  for (const locale of ["ko", "en"] as const) {
    it(`${locale}: exam.rubric 의 키는 SHEET_KEYS 와 정확히 같고 모두 비어 있지 않다`, () => {
      const rubric = rubricMessages(locale);
      expect(rubric, `${locale} exam.rubric 가 없다`).toBeTruthy();
      expect(Object.keys(rubric).sort()).toEqual([...SHEET_KEYS].sort());
      for (const key of SHEET_KEYS) {
        expect(typeof rubric[key], `${locale} exam.rubric.${key}`).toBe("string");
        expect(rubric[key].trim().length, `${locale} exam.rubric.${key}`).toBeGreaterThan(0);
      }
    });
  }

  it("교수자 안내는 '읽기 전용' 임을 말한다", () => {
    expect(rubricMessages("ko").description).toContain("읽기 전용");
    expect(rubricMessages("en").description.toLowerCase()).toContain("read-only");
  });

  it("영어 문구는 용어집(docs/i18n/glossary.md)의 '루브릭 → Rubric' 을 따른다", () => {
    const glossary = read("docs/i18n/glossary.md");
    const row = glossary.match(/^\|\s*루브릭\s*\|\s*([^|]+?)\s*\|/m);
    expect(row, "용어집에 루브릭 행이 없다").toBeTruthy();
    const term = row![1];
    const en = rubricMessages("en");
    expect(en.button).toBe(term);
    expect(en.title).toContain(term);
    expect(en.description).toContain(term);
    expect(en.buttonAriaLabel).toContain(term.toLowerCase());
  });

  it("한국어 버튼 라벨은 '평가 기준' 이다 (이슈 문구)", () => {
    expect(rubricMessages("ko").button).toBe("평가 기준");
  });
});

describe("열린 시트 — 시트 안쪽을 렌더해서 본다 (Portal 대체)", () => {
  async function renderOpen(locale: Locale, rubric: unknown) {
    const { RubricSheet } = await import("@/components/exam/RubricSheet");
    return withIntl(locale, createElement(RubricSheet, { rubric, rubricPublic: true, defaultOpen: true }));
  }

  /** 여는 태그 하나를 통째로 꺼낸다. 속성 순서에 기대지 않으려고 속성별로 따로 본다. */
  function openingTag(html: string, attr: string): string {
    const m = html.match(new RegExp(`<[a-z0-9]+\\b[^>]*\\b${attr}[^>]*>`));
    expect(m, `${attr} 를 가진 요소가 없다`).toBeTruthy();
    return m![0];
  }

  function attrOf(tag: string, name: string): string | undefined {
    return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  }

  /** `<div ...>` 로 시작하는 요소의 안쪽 마크업. div 중첩 깊이를 세어 짝이 맞는 닫는 태그까지 자른다. */
  function innerOfDiv(html: string, openTag: string): string {
    const start = html.indexOf(openTag);
    expect(start, `${openTag.slice(0, 40)} 가 없다`).toBeGreaterThan(-1);
    const from = start + openTag.length;
    const tags = /<(\/?)div\b[^>]*>/g;
    tags.lastIndex = from;
    let depth = 1;
    for (let m = tags.exec(html); m; m = tags.exec(html)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) return html.slice(from, m.index);
    }
    throw new Error("div 의 닫는 태그를 찾지 못했다");
  }

  it("열려 있으면 트리거가 열림 상태이고 시트(role=dialog)가 그려진다", async () => {
    const html = await renderOpen("ko", ITEMS);
    const trigger = openingTag(html, 'aria-haspopup="dialog"');
    expect(attrOf(trigger, "aria-expanded")).toBe("true");
    expect(attrOf(trigger, "data-state")).toBe("open");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-slot="sheet-content"');
  });

  it("시트 안에 항목이 전부, 읽기 전용 목록으로 들어 있다 (빈 목록이 아니다)", async () => {
    const html = await renderOpen("ko", ITEMS);
    const dialog = html.slice(html.indexOf('role="dialog"'));
    expect((dialog.match(/<li\b/g) ?? []).length).toBe(2);
    for (const text of ["문제 이해", "문제의 핵심 쟁점을 정확히 파악했는가", "근거 제시", "출처를 밝혔는가"]) {
      expect(dialog, text).toContain(text);
    }
    expect(dialog).not.toMatch(/<(input|textarea|select)\b/);
  });

  it("항목이 9개여도 시트 안에 모두 있다", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      evaluationArea: `영역 ${i + 1}`,
      detailedCriteria: "세부 기준 ".repeat(40),
    }));
    const html = await renderOpen("ko", many);
    const dialog = html.slice(html.indexOf('role="dialog"'));
    expect((dialog.match(/<li\b/g) ?? []).length).toBe(9);
    expect(dialog).toContain("영역 9");
  });

  it("시트 제목·부제·닫기가 한국어 메시지로 그려진다", async () => {
    const html = await renderOpen("ko", ITEMS);
    const ko = rubricMessages("ko");
    const dialog = html.slice(html.indexOf('role="dialog"'));
    expect(dialog).toMatch(new RegExp(`<h2\\b[^>]*>(<span\\b[^>]*>)?${ko.title}`)); // 제목은 h2 안에 있다
    expect(dialog).toContain(ko.description);
    expect(dialog).toContain(`>${ko.close}</button>`);
  });

  it("영어 시트는 영어 메시지만 쓴다 — 한글도, 빠진 키의 경로(exam.rubric.*)도 없다", async () => {
    const html = await renderOpen("en", ITEMS_EN);
    const en = rubricMessages("en");
    const dialog = html.slice(html.indexOf('role="dialog"'));
    for (const key of ["title", "description", "close"] as const) {
      expect(dialog, `en ${key}`).toContain(en[key]);
    }
    expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(/[가-힣]/);
    expect(html).not.toMatch(/exam\.rubric\./);
    expect(attrOf(openingTag(html, 'aria-haspopup="dialog"'), "aria-label")).toBe(en.buttonAriaLabel);
  });

  it("한국어 시트에도 빠진 키의 경로가 새지 않는다", async () => {
    expect(await renderOpen("ko", ITEMS)).not.toMatch(/exam\.rubric\./);
  });

  it("스크롤 영역은 키보드로 닿는다 — tabindex=0, role=region, 제목으로 이름 붙음", async () => {
    const html = await renderOpen("ko", ITEMS);
    const region = openingTag(html, 'role="region"');
    expect(attrOf(region, "tabindex")).toBe("0");
    expect(region).toContain("overflow-y-auto");
    // 보이는 포커스 링 — Button 과 같은 토큰
    expect(region).toMatch(/\bfocus-visible:ring-\[3px\]/);
    expect(region).toMatch(/\bfocus-visible:ring-ring\/50/);
    expect(region).toMatch(/\boutline-none\b/);

    const labelledBy = attrOf(region, "aria-labelledby");
    expect(labelledBy, "region 에 aria-labelledby 가 없다").toBeTruthy();
    // 그 id 를 가진 요소가 실제로 있고, 시트 제목 글자를 담는다
    const escaped = labelledBy!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const labelEl = html.match(new RegExp(`<[a-z0-9]+\\b[^>]*\\bid="${escaped}"[^>]*>([^<]*)<`));
    expect(labelEl, "aria-labelledby 가 가리키는 요소가 없다").toBeTruthy();
    expect(labelEl![1]).toBe(rubricMessages("ko").title);
  });

  it("스크롤 영역(region)이 목록을 담고, 닫기 버튼은 그 밖에 있다", async () => {
    const html = await renderOpen("ko", ITEMS);
    const inner = innerOfDiv(html, openingTag(html, 'role="region"'));
    expect((inner.match(/<li\b/g) ?? []).length).toBe(2);
    expect(inner).toContain("문제 이해");
    // 머리말(제목·부제)과 닫기 버튼은 스크롤 영역 밖에 있다 — 목록이 길어도 항상 보인다
    expect(inner).not.toContain("<button");
    expect(inner).not.toContain(rubricMessages("ko").description);
    expect(html.indexOf(">닫기</button>")).toBeGreaterThan(html.indexOf(inner) + inner.length);
  });

  it("Radix 가 붙인 시트 제목 id 는 그대로다 — 시트(role=dialog)의 이름이 제목을 가리킨다", async () => {
    const html = await renderOpen("ko", ITEMS);
    const dialog = openingTag(html, 'role="dialog"');
    const titleId = attrOf(dialog, "aria-labelledby");
    expect(titleId).toBeTruthy();
    const h2 = html.match(/<h2\b[^>]*>/)?.[0] ?? "";
    expect(attrOf(h2, "id")).toBe(titleId);
  });

  it("닫혀 있으면(기본) 시트가 그려지지 않는다", async () => {
    const { RubricSheet } = await import("@/components/exam/RubricSheet");
    const html = withIntl("ko", createElement(RubricSheet, { rubric: ITEMS, rubricPublic: true }));
    expect(html).not.toContain('role="dialog"');
    expect(attrOf(openingTag(html, 'aria-haspopup="dialog"'), "aria-expanded")).toBe("false");
  });
});

describe("RubricSheet 배선 — 소스 구조 (렌더로 못 보는 연결을 고정)", () => {
  const source = () => read("components/exam/RubricSheet.tsx");

  it("항목은 getPublicRubricItems 한 곳에서 만들고, 그 items 를 패널에 그대로 넘긴다", () => {
    const s = source();
    expect(s).toMatch(/const items = getPublicRubricItems\(rubric, rubricPublic\);/);
    expect(s).toMatch(/<SheetContent\b[^>]*>\s*<RubricSheetPanel items=\{items\} \/>\s*<\/SheetContent>/);
  });

  it("열림 상태는 상태로 들고 Sheet 에 그대로 넘긴다 (open 을 상수로 고정하지 않는다)", () => {
    const s = source();
    expect(s).toMatch(/const \[open, setOpen\] = useState\(defaultOpen\);/);
    expect(s).toMatch(/<Sheet open=\{open\} onOpenChange=\{setOpen\}>/);
    expect(s).not.toMatch(/<Sheet\b[^>]*\bopen=\{(true|false)\}/);
  });

  it("defaultOpen 의 기본값은 닫힘이다", () => {
    expect(source()).toMatch(/defaultOpen = false/);
  });

  it("스크롤 영역은 제목 span 의 id(useId)로 이름 붙이고, Radix 제목 id 는 덮어쓰지 않는다", () => {
    const s = source();
    expect(s).toMatch(/const headingId = useId\(\);/);
    expect(s).toMatch(/aria-labelledby=\{headingId\}/);
    expect(s).toMatch(/<span id=\{headingId\}>\{t\("rubric\.title"\)\}<\/span>/);
    // <SheetTitle id=...> 로 덮어쓰면 Radix 의 제목 경고(DialogContent 에 제목 없음)가 난다
    expect(s).not.toMatch(/<SheetTitle[^>]*\bid=/);
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
