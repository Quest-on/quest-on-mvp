// @vitest-environment jsdom
/**
 * 문법 강조 모듈을 받지 못해도 코드 보기는 깨지지 않는다 (#564 9번)
 *
 * 코드 보기의 문법 강조는 펼칠 때 따로 받는 청크다. 배포 직후 옛 청크가 사라졌거나 네트워크가 끊기면 받기가 실패한다.
 * 그때 오류가 응시 화면 전체 오류로 번지지 않고, 그 자리에 꾸밈 없는 코드가 남는지 본다. 받기에 성공하는 경우는
 * `analysis-turn-block-render.test.ts` 가 본다(셀 블록이 받은 모듈을 기억하므로 파일을 나눴다).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import koExam from "../messages/ko/exam.json";
import { AnalysisTurnBlock } from "@/components/chat/AnalysisTurnBlock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/chat/AnalysisCodeHighlighter", () => {
  throw new Error("Loading chunk failed");
});

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  // 경계가 잡은 오류도 React 가 콘솔에 알린다. 이 시험에서는 예상한 오류다.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

describe("문법 강조 모듈 받기 실패", () => {
  it("꾸밈 없는 코드가 그대로 남고 셀 블록의 나머지도 그대로다", async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        createElement(NextIntlClientProvider, {
          locale: "ko",
          messages: { exam: koExam },
          timeZone: "Asia/Seoul",
          children: createElement(AnalysisTurnBlock, {
            analysis: {
              messageId: "m1",
              outcome: "completed",
              notices: [],
              cells: [
                {
                  index: 1,
                  status: "completed",
                  code: "df.describe()",
                  codeTruncated: false,
                  logs: "count 120",
                  logsTruncated: false,
                  figures: [],
                  figuresDropped: 0,
                  replay: false,
                  replayResult: null,
                },
              ],
              figures: [],
            },
          }),
        })
      );
    });

    const toggle = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("코드 보기"));
    await act(async () => {
      toggle!.click();
    });
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }

    expect(container.querySelector('[data-testid="analysis-code-plain"]')?.textContent).toBe("df.describe()");
    expect(container.querySelector("code.language-python")).toBeNull();
    // 블록의 나머지(셀 이름, 실행 결과, 접기 단추)도 그대로다.
    expect(container.textContent).toContain("코드 1");
    expect(container.textContent).toContain("count 120");
    expect(container.textContent).toContain("코드 접기");
  });
});
