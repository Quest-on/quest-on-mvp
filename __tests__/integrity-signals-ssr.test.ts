/**
 * 서버 렌더와 하이드레이션은 저장된 값을 보지 않는다 (이슈 #514).
 *
 * `useSyncExternalStore` 의 서버 스냅샷은 항상 켜짐이다. 서버 HTML 은 사용자의 localStorage 를
 * 알 수 없으니, 하이드레이션 첫 렌더가 저장값(꺼짐)을 읽으면 HTML 이 어긋난다.
 * 여기서는 훅을 모킹 없이 **실제 React** 로 서버 렌더해서 그 계약을 본다.
 * (`integrity-signals-hook.test.ts` 는 react 를 모킹하므로 같은 파일에서 못 한다.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useIntegritySignalsPreference } from "@/hooks/useIntegritySignalsPreference";

function Probe({ examId }: { examId: string }) {
  const [show] = useIntegritySignalsPreference(examId);
  return createElement("span", { "data-show": String(show) });
}

describe("useIntegritySignalsPreference — 서버 렌더", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("저장소에 꺼짐이 있어도 서버 스냅샷은 켜짐이다", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => "false",
        setItem: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    const html = renderToStaticMarkup(createElement(Probe, { examId: "exam-1" }));
    expect(html).toContain('data-show="true"');
  });

  it("window 가 없어도 켜짐으로 렌더된다", () => {
    const html = renderToStaticMarkup(createElement(Probe, { examId: "exam-1" }));
    expect(html).toContain('data-show="true"');
  });
});
