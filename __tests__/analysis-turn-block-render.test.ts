// @vitest-environment jsdom
/**
 * 분석 셀 블록 렌더 (#564 9, 12, 13번)
 *
 * 실제 `AnalysisTurnBlock` 을 jsdom 에 렌더한다. 보는 것:
 *   9.  문법 강조 모듈(`AnalysisCodeHighlighter`)은 코드 보기를 펼칠 때 처음 받는다. 받는 동안에는 꾸밈 없는 코드가
 *       보이고, 받은 뒤에는 python 문법 강조로 바뀐다. 하이라이터를 정적으로 불러오지 않는다는 소스 검사는
 *       `exam-bundle-highlighter.test.ts` 에 있다.
 *   12. 만료 복구의 복원 셀은 파일을 여는 코드 한 줄과 내부 결과 줄 대신 "이전 단계 다시 실행"과 다시 실행한 셀 수를
 *       한 줄로 보인다. 학생 화면과 교수 채점 화면이 같다.
 *   13. 그림 크게 보기 대화상자는 기본 너비(sm 이상 32rem)에 묶이지 않는다. CSS 는 jsdom 이 계산하지 않으므로 실제로
 *       붙는 클래스(tailwind-merge 결과)를 본다.
 *
 * 문법 강조 모듈을 받는 횟수를 세려고 모의 모듈이 실제 모듈을 그대로 돌려주되, 테스트가 풀어 줄 때까지 기다리게 한다.
 * 받은 모듈은 파일 안에서 계속 쓰이므로(셀 블록이 한 번 받은 값을 기억한다) 펼침 테스트를 맨 앞에 둔다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import koExam from "../messages/ko/exam.json";
import { AnalysisTurnBlock, type AnalysisViewer } from "@/components/chat/AnalysisTurnBlock";
import type { ClientAnalysisCell, ClientAnalysisTurn } from "@/lib/analysis-exec/metadata";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const highlighter = vi.hoisted(() => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { loads: 0, gate, release: () => release() };
});

vi.mock("@/components/chat/AnalysisCodeHighlighter", async (importOriginal) => {
  highlighter.loads += 1;
  await highlighter.gate;
  return importOriginal();
});

const REPLAY_CODE = 'exec(open("/mnt/data/file-abc-quest_on_replay.py").read())';

function cell(overrides: Partial<ClientAnalysisCell> = {}): ClientAnalysisCell {
  return {
    index: 1,
    status: "completed",
    code: "import pandas as pd\ndf = pd.read_csv('/mnt/data/sales.csv')\nprint(df.shape)",
    codeTruncated: false,
    logs: "(120, 5)",
    logsTruncated: false,
    figures: [],
    figuresDropped: 0,
    replay: false,
    replayResult: null,
    ...overrides,
  };
}

function replayCell(overrides: Partial<ClientAnalysisCell> = {}): ClientAnalysisCell {
  return cell({
    index: 1,
    code: REPLAY_CODE,
    logs: "QUEST_ON_REPLAY ok=3 failed=0\n",
    replay: true,
    replayResult: { ok: 3, failed: 0 },
    ...overrides,
  });
}

function turn(cells: ClientAnalysisCell[]): ClientAnalysisTurn {
  return { messageId: "m1", outcome: "completed", notices: ["environment_restarted"], cells, figures: [] };
}

let root: Root | null = null;
let container: HTMLDivElement;

async function mount(analysis: ClientAnalysisTurn, viewer: AnalysisViewer = "student") {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(NextIntlClientProvider, {
        locale: "ko",
        messages: { exam: koExam },
        timeZone: "Asia/Seoul",
        children: createElement(AnalysisTurnBlock, { analysis, viewer }),
      })
    );
  });
}

async function click(element: Element | null | undefined) {
  if (!element) throw new Error("element is missing");
  await act(async () => {
    (element as HTMLElement).click();
  });
}

const buttonsWithText = (label: string) =>
  [...container.querySelectorAll("button")].filter((button) => button.textContent?.includes(label));
const text = () => document.body.textContent ?? "";

/** 실제 문법 강조 모듈을 처음 받을 때는 변환과 적재에 수십 ms 가 걸린다. 화면이 바뀔 때까지 기다린다. */
async function waitFor(check: () => boolean, label: string) {
  for (let i = 0; i < 200 && !check(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  if (!check()) throw new Error(`timed out waiting for ${label}`);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
});

describe("코드 보기의 문법 강조는 펼칠 때 받는다 (#564 9번)", () => {
  it("펼치기 전에는 받지 않고, 받는 동안은 꾸밈 없는 코드, 받은 뒤에는 python 문법 강조다", async () => {
    await mount(turn([cell()]));
    expect(highlighter.loads).toBe(0);
    expect(text()).not.toContain("read_csv");

    await click(buttonsWithText("코드 보기")[0]);
    expect(highlighter.loads).toBe(1);
    const plain = container.querySelector('[data-testid="analysis-code-plain"]');
    expect(plain?.textContent).toContain("df = pd.read_csv('/mnt/data/sales.csv')");

    // 모듈을 다 받기 전에는 계속 꾸밈 없는 코드다.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.querySelector('[data-testid="analysis-code-plain"]')).not.toBeNull();

    highlighter.release();
    await waitFor(() => container.querySelector("code.language-python") !== null, "highlighted code");
    expect(container.querySelector('[data-testid="analysis-code-plain"]')).toBeNull();
    const code = container.querySelector("code.language-python");
    expect(code).not.toBeNull();
    // python 문법이 등록돼 있어야 키워드와 문자열이 토큰으로 나뉜다(등록이 없으면 토큰 없이 글자만 나온다).
    const tokens = [...code!.querySelectorAll("span.token")].map((token) => token.textContent);
    expect(tokens).toEqual(expect.arrayContaining(["import", "as", "'/mnt/data/sales.csv'"]));
    expect(code!.textContent).toContain("print(df.shape)");
    expect(highlighter.loads).toBe(1);
  });

  it("한 번 받은 뒤에는 다른 셀을 펼쳐도 다시 받지 않고 바로 문법 강조로 보인다", async () => {
    await mount(turn([cell(), cell({ index: 2, code: "df.describe()" })]));
    await click(buttonsWithText("코드 보기")[1]);
    expect(container.querySelector('[data-testid="analysis-code-plain"]')).toBeNull();
    expect(container.querySelector("code.language-python")?.textContent).toContain("df.describe()");
    expect(highlighter.loads).toBe(1);
  });
});

describe("복원 셀은 코드 대신 '이전 단계 다시 실행'으로 접어 보인다 (#564 12번)", () => {
  it.each<AnalysisViewer>(["student", "instructor"])("%s 화면: 이름과 다시 실행한 셀 수만 보이고 파일을 여는 코드와 결과 줄은 없다", async (viewer) => {
    await mount(turn([replayCell(), cell({ index: 2 })]), viewer);

    const replay = container.querySelectorAll('[data-testid="analysis-replay-cell"]');
    expect(replay).toHaveLength(1);
    expect(replay[0].textContent).toContain("이전 단계 다시 실행");
    expect(replay[0].textContent).toContain("앞에서 실행한 코드 3개를 다시 실행했습니다.");
    // 펼칠 것이 없다. 코드 보기 단추는 일반 셀에만 있다.
    expect(replay[0].querySelector("button")).toBeNull();
    expect(buttonsWithText("코드 보기")).toHaveLength(1);
    expect(text()).toContain("코드 2");
    for (const internal of ["quest_on_replay", "QUEST_ON_REPLAY", "exec(open", "Python 1줄"]) {
      expect(text(), internal).not.toContain(internal);
    }
  });

  it("다시 실행한 셀 중 실패가 있으면 그 수를 알린다", async () => {
    await mount(
      turn([
        replayCell({
          logs: "QUEST_ON_REPLAY ok=2 failed=1\nQUEST_ON_REPLAY_ERROR Q1-C2 KeyError: 'x'\n",
          replayResult: { ok: 2, failed: 1 },
        }),
      ])
    );
    const replay = container.querySelector('[data-testid="analysis-replay-cell"]');
    expect(replay?.textContent).toContain("앞에서 실행한 코드 3개를 다시 실행했고, 그중 1개는 오류로 끝났습니다.");
    expect(text()).not.toContain("QUEST_ON_REPLAY_ERROR");
  });

  it("끝까지 돌지 못한 복원 셀은 다시 실행하지 못했다고 알리고, 셀 오류 문구와 오류 출력은 보이지 않는다", async () => {
    await mount(
      turn([
        replayCell({
          status: "failed",
          logs: "FileNotFoundError: [Errno 2] No such file or directory: '/mnt/data/file-abc-quest_on_replay.py'",
          replayResult: null,
        }),
      ])
    );
    const replay = container.querySelector('[data-testid="analysis-replay-cell"]');
    expect(replay?.textContent).toContain("앞에서 실행한 코드를 끝까지 다시 실행하지 못했습니다.");
    expect(text()).not.toContain("FileNotFoundError");
    expect(text()).not.toContain("이 코드는 실행 중 오류로 끝났습니다.");
  });
});

describe("그림 크게 보기는 기본 대화상자 너비에 묶이지 않는다 (#564 13번)", () => {
  it("sm 이상의 최대 너비를 덮어쓰고(sm:max-w-lg 없음), 그림은 대화상자 너비를 채운다", async () => {
    const figure = { url: "/api/session/s1/analysis/figures/m1/1.png", name: "1.png" };
    await mount(turn([cell({ figures: [figure] })]));

    await click(container.querySelector('button[aria-label="그림 1 크게 보기"]'));
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content).not.toBeNull();
    const classes = content!.className.split(/\s+/);
    expect(classes).toContain("sm:max-w-[min(95vw,64rem)]");
    expect(classes).not.toContain("sm:max-w-lg");
    // 640px 아래는 기본 너비(화면 너비 - 2rem)를 그대로 쓴다.
    expect(classes).toContain("max-w-[calc(100%-2rem)]");

    const enlarged = content!.querySelector("img");
    expect(enlarged?.getAttribute("src")).toBe(figure.url);
    expect(enlarged?.className.split(/\s+/)).toEqual(expect.arrayContaining(["w-full", "h-auto", "object-contain"]));
  });
});
