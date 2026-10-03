/**
 * 학생 공개 자료의 화면 (#544).
 *
 *  - 학생: 응시 화면 도구 막대의 "자료" 버튼과 읽기 전용 시트(MaterialsSheet). 공개 파일이 없으면 버튼이 없다.
 *  - 교수자: 수업 자료 목록의 파일 행(MaterialFileRow)마다 "학생에게 공개" 스위치. 기본은 꺼짐이다.
 *
 * 렌더 방식은 평가 기준 시트 테스트(exam-rubric-sheet.test.ts)와 같다. 기본 환경이 node 라 react-dom/server
 * 로 렌더하고, Radix Portal 을 "자식을 그 자리에 그린다" 로 바꿔 열린 시트의 안쪽을 본다. 내려받기
 * 클릭과 실패 감지는 exam-materials-download.test.ts 가 jsdom 으로 본다. 실제 내려받기와 좁은 화면
 * 배치는 브라우저의 몫이라 스테이징 QA 에서 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import koExam from "../messages/ko/exam.json";
import enExam from "../messages/en/exam.json";
import koAuthoring from "../messages/ko/authoring.json";
import enAuthoring from "../messages/en/authoring.json";

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  const { createElement: h, Fragment } = await import("react");
  return {
    ...actual,
    Portal: ({ children }: { children?: ReactNode }) => h(Fragment, null, children),
  };
});

// 내려받기 주소(materialDownloadHref)는 프로젝트 호스트를 본다. 테스트 결과가 실행 환경의 값에
// 따라 바뀌지 않게 고정한다(CI 의 단위 테스트에는 이 값이 없다).
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

type Locale = "ko" | "en";

function withIntl(locale: Locale, node: ReactElement): string {
  const messages =
    locale === "ko" ? { exam: koExam, authoring: koAuthoring } : { exam: enExam, authoring: enAuthoring };
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages, timeZone: "Asia/Seoul", children: node }),
  );
}

const XLSX = "https://proj.supabase.co/storage/v1/object/public/exam-materials/instructor-1/2026-10-03_a.xlsx";
const PDF = "https://proj.supabase.co/storage/v1/object/public/exam-materials/instructor-1/2026-10-03_b.pdf";
const ORIGINAL = "하냥센스_시험용_dataset.xlsx";
const ITEMS = [
  { url: XLSX, fileName: ORIGINAL, extension: "xlsx" },
  { url: PDF, fileName: "2026-10-03_b.pdf", extension: "pdf" },
];

async function renderSheet(locale: Locale, materials: unknown, defaultOpen = false) {
  const { MaterialsSheet } = await import("@/components/exam/MaterialsSheet");
  return withIntl(locale, createElement(MaterialsSheet, { materials, defaultOpen }));
}

describe("MaterialsSheet 버튼 - 공개 파일이 있을 때만 있다", () => {
  it("공개 파일이 있으면 시트를 여는 '자료' 버튼과 개수가 보인다", async () => {
    const html = await renderSheet("ko", ITEMS);
    expect(html).toContain("<button");
    expect(html).toContain('aria-label="시험 자료 2개 보기"');
    expect(html).toContain(">자료</span>");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("공개 파일이 없으면(빈 배열, 없음, 배열 아님) 버튼이 없다", async () => {
    for (const materials of [[], undefined, null, "x", { url: XLSX }]) {
      expect(await renderSheet("ko", materials), JSON.stringify(materials)).toBe("");
    }
  });

  it("쓸 수 없는 항목뿐이면(http(s) 가 아닌 URL, 모양이 깨짐) 버튼이 없다", async () => {
    const html = await renderSheet("ko", [{ url: "javascript:alert(1)", fileName: "a.xlsx" }, null, { fileName: "b.csv" }]);
    expect(html).toBe("");
  });

  it("영어 화면이면 문구가 영어다", async () => {
    const html = await renderSheet("en", ITEMS);
    expect(html).toContain('aria-label="View 2 exam materials"');
    expect(html).toContain(">Materials</span>");
    expect(html).not.toMatch(/[가-힣]/);
  });
});

describe("열린 시트 - 파일마다 이름, 형식, 내려받기 링크", () => {
  it("시트 제목과 설명이 있고 목록은 이름 있는 스크롤 영역 안에 있다", async () => {
    const html = await renderSheet("ko", ITEMS, true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("시험 자료");
    expect(html).toContain("교수자가 공개한 파일입니다.");
    const region = html.match(/<div[^>]*role="region"[^>]*>/)?.[0] ?? "";
    expect(region).toContain('tabindex="0"');
    const labelledBy = region.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy}"`);
  });

  /** 열린 시트의 내려받기 버튼들(순서대로). 이제 링크가 아니라 버튼이다(#546 리뷰 B1). */
  function downloadButtons(html: string): string[] {
    return [...html.matchAll(/<button[^>]*aria-label="[^"]*내려받기"[^>]*>/g)].map((m) => m[0]);
  }

  it("파일마다 원래 이름, 형식, 내려받기 버튼이 있다", async () => {
    const html = await renderSheet("ko", ITEMS, true);
    expect((html.match(/<li\b/g) ?? []).length).toBe(2);
    expect(html).toContain(`>` + ORIGINAL + `</p>`);
    expect(html).not.toContain(">2026-10-03_a.xlsx<");
    expect(html).toContain("형식: XLSX");
    expect(html).toContain("형식: PDF");
    const buttons = downloadButtons(html);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toContain(`aria-label="` + ORIGINAL + ` 내려받기"`);
  });

  it("내려받기는 최상위 탐색이 아니다 - 숨긴 iframe 이 시트 밖에 있고 <a href> 로 걸지 않는다 (#546 리뷰 B1, 재검토)", async () => {
    // 클릭, load 감지, 실패 알림은 jsdom 으로 실제 동작을 본다(exam-materials-download.test.ts).
    for (const open of [false, true]) {
      const html = await renderSheet("ko", ITEMS, open);
      // 시트가 닫혀 있어도(시트 내용이 없어도) 파일마다 iframe 이 있다.
      expect(html.includes('role="dialog"'), String(open)).toBe(open);
      const iframes = html.match(/<iframe[^>]*>/g) ?? [];
      expect(iframes, String(open)).toHaveLength(2);
      for (const iframe of iframes) {
        expect(iframe).toContain('aria-hidden="true"');
        expect(iframe).toContain('tabindex="-1"');
        expect(iframe).toMatch(/\bsr-only\b/);
        expect(iframe).not.toContain("src=");
      }
      expect(html).not.toMatch(/<a[^>]*href="https?:\/\/[\w.-]*supabase/);
      // 실패하기 전에는 알림이 없다.
      expect(html).not.toContain('role="alert"');
    }
  });

  it("확장자가 없으면 형식은 '알 수 없음' 이다", async () => {
    const html = await renderSheet("ko", [{ url: "https://x.test/README", fileName: "README", extension: "" }], true);
    expect(html).toContain("형식: 알 수 없음");
  });
});

describe("MaterialsSheet 구조와 메시지", () => {
  const source = () => read("components/exam/MaterialsSheet.tsx");

  it("평가 기준 시트와 같은 위계: 제목, 설명, 스크롤 영역, 닫기 버튼, 좁은 화면에서는 전체 폭", () => {
    const s = source();
    expect(s).toContain("<SheetTitle");
    expect(s).toContain("<SheetDescription");
    expect(s).toContain("<SheetClose");
    expect(s).toMatch(/overflow-y-auto/);
    expect(s).toMatch(/\bw-full\b/);
    expect(s).toMatch(/hidden sm:inline/);
  });

  it("한국어/영어 문구를 하드코딩하지 않는다", () => {
    const stripped = source().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
    expect(stripped).not.toMatch(/[가-힣]/);
  });

  it("소스가 부르는 t('materials.*') 키가 ko/en 에 모두 있고 두 언어의 키가 같다", () => {
    const used = [...new Set([...source().matchAll(/\bt\("materials\.([A-Za-z]+)"/g)].map((m) => m[1]))].sort();
    const ko = (koExam as unknown as { materials: Record<string, string> }).materials;
    const en = (enExam as unknown as { materials: Record<string, string> }).materials;
    expect(Object.keys(ko).sort()).toEqual(used);
    expect(Object.keys(en).sort()).toEqual(used);
    for (const key of used) {
      expect(ko[key].trim().length, `ko materials.${key}`).toBeGreaterThan(0);
      expect(en[key].trim().length, `en materials.${key}`).toBeGreaterThan(0);
    }
  });

  it("도구 막대가 평가 기준 버튼 옆에 자료 버튼을 두고, 응시 화면이 서버의 student_materials 를 넘긴다", () => {
    const toolbar = read("components/exam/ExamCenterToolbar.tsx");
    expect(toolbar).toMatch(/<MaterialsSheet materials=\{studentMaterials\} \/>\s*<RubricSheet/);
    expect(read("app/(app)/exam/[code]/page.tsx")).toContain("studentMaterials={exam.student_materials}");
  });
});

async function renderRow(locale: Locale, props: Record<string, unknown>) {
  const { MaterialFileRow } = await import("@/components/instructor/MaterialFileRow");
  return withIntl(
    locale,
    createElement(
      "ul",
      null,
      createElement(MaterialFileRow, {
        name: "하냥센스_고객500.xlsx",
        icon: null,
        removeAriaLabel: "삭제",
        onRemove: () => {},
        ...props,
      }),
    ),
  );
}

describe("MaterialFileRow - 교수자 파일 행의 학생 공개 스위치", () => {
  it("기본은 꺼짐이고, 스위치 이름에 파일 이름이 들어가며 도움말과 연결된다", async () => {
    const html = await renderRow("ko", { onShareChange: () => {}, shareHelpId: "help-1" });
    const sw = html.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? "";
    expect(sw).toContain('aria-checked="false"');
    expect(sw).toContain('aria-label="하냥센스_고객500.xlsx 학생에게 공개"');
    expect(sw).toContain('aria-describedby="help-1"');
    expect(html).toContain("학생에게 공개");
  });

  it("공개로 표시한 파일은 켜짐이다", async () => {
    const html = await renderRow("ko", { onShareChange: () => {}, shared: true });
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/);
  });

  it("업로드가 끝나지 않았으면(공개할 URL 이 없으면) 스위치가 비활성이다", async () => {
    const html = await renderRow("ko", { onShareChange: () => {}, canShare: false });
    const sw = html.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? "";
    expect(sw).toMatch(/\sdisabled=""/);
  });

  it("onShareChange 를 넘기지 않으면 스위치를 그리지 않는다", async () => {
    const html = await renderRow("ko", {});
    expect(html).not.toContain('role="switch"');
  });

  it("영어 화면이면 영어다", async () => {
    const html = await renderRow("en", { onShareChange: () => {} });
    expect(html).toContain('aria-label="Share 하냥센스_고객500.xlsx with students"');
    expect(html).toContain("Share with students");
  });

  it("도움말 문구는 이슈의 문장 그대로이고 ko/en 에 모두 있다", () => {
    const ko = (koAuthoring as unknown as { simpleExamAuthoringForm: Record<string, string> }).simpleExamAuthoringForm;
    const en = (enAuthoring as unknown as { simpleExamAuthoringForm: Record<string, string> }).simpleExamAuthoringForm;
    expect(ko.materialShareHelp).toBe("켜면 학생이 시험 화면에서 이 파일을 내려받을 수 있습니다.");
    for (const key of ["materialShareLabel", "materialShareAria", "materialShareHelp"]) {
      expect(ko[key], `ko ${key}`).toBeTruthy();
      expect(en[key], `en ${key}`).toBeTruthy();
    }
  });

  it("폼은 기존 파일과 새 파일 모두 같은 행을 쓰고 도움말을 목록 아래에 한 번 둔다", () => {
    const form = read("components/instructor/SimpleExamAuthoringForm.tsx");
    expect((form.match(/<MaterialFileRow\b/g) ?? []).length).toBe(2);
    expect(form).toMatch(/<p id=\{materialShareHelpId\} className="type-hint">/);
    expect(form).toContain('t("simpleExamAuthoringForm.materialShareHelp")');
  });
});
