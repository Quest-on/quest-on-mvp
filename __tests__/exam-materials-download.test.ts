// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://quest-on.app/exam/ABC123"}

/**
 * 응시 화면의 자료 내려받기 동작 (#544, #546 재검토).
 *
 * 실제 MaterialsSheet 를 jsdom 에 렌더해 클릭과 iframe load 이벤트를 흉내 낸다. 브라우저의 응답도
 * 흉내 낸다: 첨부 응답(Content-Disposition: attachment)은 iframe 에 문서를 만들지 않아 load 가 없고,
 * Storage 오류 JSON 과 CSP 차단은 load 를 낸다(리뷰의 헤드리스 Chromium 측정). jsdom 은 iframe 을
 * 끼울 때 about:blank 의 load 를 한 번 내고, 바깥 주소를 src 에 넣으면 읽지도 load 를 내지도 않는다.
 * 그래서 src 는 그대로 넣고 넣은 값을 기록하며, 오류 응답은 load 이벤트를 직접 보내 흉내 낸다.
 *
 * 보는 것:
 *   1. iframe 은 시트 밖에 있고 시트를 닫아도 남는다(닫아도 내려받기가 끊기지 않는다).
 *   2. 누르면 그 파일의 iframe src 에 조각 없는 주소를 넣는다. 최상위 이동과 새 탭이 없다.
 *      같은 파일을 다시 누르면 같은 주소를 다시 넣는다(브라우저는 이때 새로 요청한다).
 *   3. 누른 뒤 load 가 오면 그 파일 아래에 실패 알림과 새 탭 링크가 보인다. 누르기 전의 load 는 무시한다.
 *   4. 시트가 닫힌 뒤 실패하면 화면 위 알림(toast)으로도 알린다.
 * 실제 브라우저의 첨부 응답과 load 동작은 스테이징 QA 에서 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import koExam from "../messages/ko/exam.json";

const toastMock = vi.hoisted(() => ({ error: vi.fn(), dismiss: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: toastMock }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE = "https://proj.supabase.co/storage/v1/object/public/exam-materials/instructor-1";
const XLSX = `${BASE}/2026-10-03_a.xlsx`;
const CSV = `${BASE}/2026-10-03_c.csv`;
const OTHER = "https://files.example.test/guide.pdf";
const XLSX_NAME = "하냥센스_시험용_dataset.xlsx";
const CSV_NAME = "고객 목록.csv";
const ITEMS = [
  { url: XLSX, fileName: XLSX_NAME, extension: "xlsx" },
  { url: CSV, fileName: CSV_NAME, extension: "csv" },
  { url: OTHER, fileName: "guide.pdf", extension: "pdf" },
];
const XLSX_HREF = `${XLSX}?download=${encodeURIComponent(XLSX_NAME)}`;
const CSV_HREF = `${CSV}?download=${encodeURIComponent(CSV_NAME)}`;
const FAILED_TEXT = "파일을 내려받지 못했습니다. 다시 시도하거나 새 탭에서 여세요.";

let root: Root | null = null;
let container: HTMLDivElement;
/** iframe 에 넣은 src 기록(파일 URL 순서가 아니라 호출 순서). */
let srcCalls: Array<{ frame: HTMLIFrameElement; value: string }>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  container = document.createElement("div");
  document.body.appendChild(container);
  srcCalls = [];
  const original = HTMLIFrameElement.prototype.setAttribute;
  vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(function (
    this: HTMLIFrameElement,
    name: string,
    value: string,
  ) {
    // src 를 넣은 기록을 남기고 실제로도 넣는다. 다른 속성(React 가 붙이는 title, class 등)은 기록하지 않는다.
    if (name === "src") srcCalls.push({ frame: this, value });
    original.call(this, name, value);
  });
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  toastMock.error.mockReset();
  toastMock.dismiss.mockReset();
});

function withIntl(node: ReactElement): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "ko",
    messages: { exam: koExam },
    timeZone: "Asia/Seoul",
    children: node,
  });
}

async function mount(defaultOpen: boolean, materials: unknown = ITEMS) {
  const { MaterialsSheet } = await import("@/components/exam/MaterialsSheet");
  root = createRoot(container);
  await act(async () => {
    root!.render(withIntl(createElement(MaterialsSheet, { materials, defaultOpen })));
  });
}

const frames = () => [...container.querySelectorAll("iframe")];
const dialog = () => document.querySelector('[role="dialog"]');
const alerts = () => [...document.querySelectorAll('[role="alert"]')];
const itemOf = (name: string) =>
  [...document.querySelectorAll("li")].find((li) => li.textContent?.includes(name)) ?? null;

function downloadButton(name: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${name} 내려받기"]`);
  if (!button) throw new Error(`download button for ${name} is missing`);
  return button;
}

async function click(element: Element | null) {
  if (!element) throw new Error("element is missing");
  await act(async () => {
    (element as HTMLElement).click();
  });
}

/** 브라우저가 iframe 에 오류 문서(Storage 오류 JSON, CSP 차단 페이지)를 띄운 것을 흉내 낸다. */
async function fireLoad(frame: HTMLIFrameElement) {
  await act(async () => {
    frame.dispatchEvent(new Event("load"));
  });
}

function frameFor(url: string): HTMLIFrameElement {
  const calls = srcCalls.filter((call) => call.value.startsWith(url));
  const frame = calls.at(-1)?.frame;
  if (!frame) throw new Error(`no src was set for ${url}`);
  return frame;
}

describe("숨긴 iframe 의 위치", () => {
  it("내려받을 수 있는 파일마다 iframe 이 하나 있고, 시트가 닫혀 있어도 있다", async () => {
    await mount(false);
    expect(dialog()).toBeNull();
    // Supabase 공개 객체 두 개만. 그 밖의 주소(guide.pdf)는 새 탭으로 열어 iframe 이 없다.
    expect(frames()).toHaveLength(2);
    for (const frame of frames()) {
      expect(frame.getAttribute("aria-hidden")).toBe("true");
      expect(frame.getAttribute("tabindex")).toBe("-1");
      expect(frame.className).toMatch(/\bsr-only\b/);
      expect(frame.hasAttribute("src")).toBe(false);
    }
  });

  it("시트가 열려 있어도 iframe 은 시트 내용 밖(도구 막대 쪽)에 있다", async () => {
    await mount(true);
    const content = dialog();
    expect(content).not.toBeNull();
    expect(frames()).toHaveLength(2);
    for (const frame of frames()) expect(content!.contains(frame)).toBe(false);
  });
});

describe("내려받기 버튼", () => {
  it("누르면 그 파일의 iframe src 에 조각 없는 주소를 넣는다. 최상위 이동과 새 탭이 없다", async () => {
    await mount(true);
    const before = window.location.href;
    await click(downloadButton(XLSX_NAME));
    expect(srcCalls.map((call) => call.value)).toEqual([XLSX_HREF]);
    expect(XLSX_HREF).not.toContain("#");
    expect(frames()).toContain(srcCalls[0].frame);
    expect(window.open).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
  });

  it("같은 파일을 다시 누르면 같은 주소를 다시 넣는다 (조각 없이, 같은 iframe)", async () => {
    await mount(true);
    await click(downloadButton(XLSX_NAME));
    await click(downloadButton(XLSX_NAME));
    expect(srcCalls.map((call) => call.value)).toEqual([XLSX_HREF, XLSX_HREF]);
    expect(srcCalls[0].frame).toBe(srcCalls[1].frame);
  });

  it("파일마다 다른 iframe 을 쓴다 (앞 파일의 응답을 기다리는 중에 다른 파일을 눌러도 끊기지 않는다)", async () => {
    await mount(true);
    await click(downloadButton(XLSX_NAME));
    await click(downloadButton(CSV_NAME));
    expect(srcCalls.map((call) => call.value)).toEqual([XLSX_HREF, CSV_HREF]);
    expect(srcCalls[0].frame).not.toBe(srcCalls[1].frame);
  });

  it("Supabase 공개 객체가 아니면 새 탭으로 열고 iframe 을 쓰지 않는다", async () => {
    await mount(true);
    await click(downloadButton("guide.pdf"));
    expect(window.open).toHaveBeenCalledWith(OTHER, "_blank", "noopener,noreferrer");
    expect(srcCalls).toEqual([]);
  });
});

describe("실패 감지 (iframe load)", () => {
  it("첨부 응답처럼 load 가 없으면 알림도 없다", async () => {
    await mount(true);
    await click(downloadButton(XLSX_NAME));
    expect(alerts()).toEqual([]);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("누르기 전의 load(처음 끼울 때의 about:blank)는 실패가 아니다", async () => {
    await mount(true);
    for (const frame of frames()) await fireLoad(frame);
    expect(alerts()).toEqual([]);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("누른 뒤 load 가 오면 그 파일 아래에 실패 알림과 새 탭 링크가 보인다", async () => {
    await mount(true);
    await click(downloadButton(XLSX_NAME));
    await fireLoad(frameFor(XLSX));

    expect(alerts()).toHaveLength(1);
    const alert = alerts()[0];
    expect(itemOf(XLSX_NAME)!.contains(alert)).toBe(true);
    expect(alert.textContent).toContain(FAILED_TEXT);
    const link = alert.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(XLSX_HREF);
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link!.getAttribute("aria-label")).toBe(`${XLSX_NAME} 새 탭에서 열기`);
    expect(link!.textContent).toBe("새 탭에서 열기");
    // 시트가 열려 있으면 목록 안의 알림으로 충분하다.
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("다시 누르면 알림이 사라지고, 또 실패하면 다시 보인다. 성공하면(load 없음) 사라진 채로 남는다", async () => {
    await mount(true);
    await click(downloadButton(XLSX_NAME));
    await fireLoad(frameFor(XLSX));
    expect(alerts()).toHaveLength(1);

    await click(downloadButton(XLSX_NAME));
    expect(alerts()).toEqual([]);
    await fireLoad(frameFor(XLSX));
    expect(alerts()).toHaveLength(1);

    await click(downloadButton(XLSX_NAME));
    expect(alerts()).toEqual([]);
  });

  it("실패는 파일별로 판정한다", async () => {
    await mount(true);
    await click(downloadButton(XLSX_NAME));
    await click(downloadButton(CSV_NAME));
    await fireLoad(frameFor(CSV));
    expect(alerts()).toHaveLength(1);
    expect(itemOf(CSV_NAME)!.contains(alerts()[0])).toBe(true);
    expect(itemOf(XLSX_NAME)!.querySelector('[role="alert"]')).toBeNull();
  });

  it("시트를 닫아도 내려받기 iframe 은 남고, 닫힌 뒤 실패하면 toast 로 알린다. 다시 열면 목록에도 알림이 있다", async () => {
    await mount(true);
    await click(downloadButton(XLSX_NAME));
    const frame = frameFor(XLSX);

    const close = [...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "닫기");
    await click(close ?? null);
    expect(dialog()).toBeNull();
    expect(frames()).toContain(frame);

    await fireLoad(frame);
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    const [render, options] = toastMock.error.mock.calls[0] as [
      (shown: { id: string }) => ReactElement,
      { id: string; duration: number },
    ];
    expect(options.id).toBe(`material-download-failed:${XLSX}`);
    expect(options.duration).toBeGreaterThanOrEqual(8000);
    const html = renderToStaticMarkup(render({ id: options.id }));
    expect(html).toContain(XLSX_NAME);
    expect(html).toContain(FAILED_TEXT);
    expect(html).toContain(`href="${XLSX_HREF.replace(/&/g, "&amp;")}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');

    await click(container.querySelector('button[aria-haspopup="dialog"]'));
    expect(dialog()).not.toBeNull();
    expect(alerts()).toHaveLength(1);
    expect(itemOf(XLSX_NAME)!.contains(alerts()[0])).toBe(true);
  });
});

describe("materialDownloadReducer (순수 판정)", () => {
  it("요청 전 load 는 무시하고 같은 객체를 돌려준다, 요청 뒤 load 는 실패다, 다시 요청하면 대기로 돌아간다", async () => {
    const { materialDownloadReducer: reduce } = await import("@/components/exam/MaterialsSheet");
    const empty = {};
    expect(reduce(empty, { type: "frame-load", url: XLSX })).toBe(empty);
    const pending = reduce(empty, { type: "request", url: XLSX });
    expect(pending).toEqual({ [XLSX]: "pending" });
    expect(reduce(pending, { type: "request", url: XLSX })).toBe(pending);
    const failed = reduce(pending, { type: "frame-load", url: XLSX });
    expect(failed).toEqual({ [XLSX]: "failed" });
    // 실패한 뒤 또 오는 load 는 새 실패가 아니다(toast 를 두 번 띄우지 않는다).
    expect(reduce(failed, { type: "frame-load", url: XLSX })).toBe(failed);
    expect(reduce(failed, { type: "request", url: XLSX })).toEqual({ [XLSX]: "pending" });
    // 다른 파일의 load 는 이 파일에 영향이 없다.
    expect(reduce(pending, { type: "frame-load", url: CSV })).toBe(pending);
  });
});
