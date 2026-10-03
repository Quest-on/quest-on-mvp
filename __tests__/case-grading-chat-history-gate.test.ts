// @vitest-environment jsdom
/**
 * 채점이 열리기 전에는 AI 채점 대화 패널이 대화 기록을 부르지 않는다 (이슈 #575 후속).
 *
 * 패널(`CaseGradingChat`)은 열리자마자 `GET /api/session/<id>/case-grade/chat?qIdx=` 로 대화 기록을 불렀다.
 * 서버(`requireCaseGradeAccess` 의 `requireGradable`)는 채점이 아직 열리지 않았으면(시험 진행 중, 과제 마감 전)
 * 409 로 거절한다. 제출 여부와는 상관없다. React Query 기본 재시도(3회)까지 더해 응시 중 학생의 채점 화면을 열 때마다
 * 콘솔에 409 가 네 번 찍혔고, 패널은 재시도 동안 '불러오는 중'을 보이다 빈 상태가 됐다.
 * 이제 화면이 서버와 같은 `isGradingOpen` 기준으로 `historyEnabled` 를 넘기고, 패널은 false 면 부르지 않는다.
 *
 * jsdom 에 실제 컴포넌트를 렌더하고 QueryClient 는 기본 옵션 그대로 쓴다. fetch 는 가짜다.
 * 무거운 마크다운 렌더러는 이 검사와 상관없어 빈 컴포넌트로 바꾼다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/chat/AIMessageRenderer", () => ({ default: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HISTORY_URL = "/api/session/session-1/case-grade/chat?qIdx=0";

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messages: [] }) });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
  vi.unstubAllGlobals();
});

async function mount(extraProps: { historyEnabled?: boolean }) {
  const { CaseGradingChat } = await import("@/components/instructor/CaseGradingChat");
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(CaseGradingChat, { sessionId: "session-1", qIdx: 0, questionNumber: 1, ...extraProps }),
      ),
    );
  });
  // 쿼리가 돌 기회를 한 번 더 준다.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function historyRequests(): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/case-grade/chat?"));
}

describe("CaseGradingChat 대화 기록 요청", () => {
  it("채점이 열리기 전(historyEnabled=false)에는 대화 기록을 부르지 않고 빈 상태를 보인다", async () => {
    await mount({ historyEnabled: false });
    expect(historyRequests()).toEqual([]);
    expect(container.textContent).toContain("caseGradingChat.emptyTitle");
    expect(container.textContent).not.toContain("caseGradingChat.historyLoading");
  });

  it("채점이 열려 있으면(기본값) 지금처럼 대화 기록을 한 번 부른다", async () => {
    await mount({});
    expect(historyRequests()).toEqual([HISTORY_URL]);
  });

  it("historyEnabled=true 도 기본값과 같다", async () => {
    await mount({ historyEnabled: true });
    expect(historyRequests()).toEqual([HISTORY_URL]);
  });
});
