// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://quest-on.app/"}

/**
 * 이슈 #538 — 응시 중 화면에서는 선택 기록이 없어도 분석 동의 카드를 띄우지 않는다.
 *
 * 카드가 오른쪽 아래에서 AI 입력창·최종 답안 버튼·제출 버튼을 덮었다. 이 파일은 실제
 * WebsiteAnalytics 를 jsdom 에 렌더해서 세 가지를 본다.
 *   1. 응시 중 화면 + 선택 기록 없음 → 카드가 없다.
 *   2. 그래도 동의 의미는 그대로다 → 쿠키는 denied, posthog 는 init/opt-in 되지 않는다.
 *      (같은 화면에서 granted 면 init 되는 대조군으로 이 검사가 헛돌지 않음을 보인다.)
 *   3. 일반 지원 페이지의 카드, 이미 선택한 사용자의 pill/설정 패널은 그대로다.
 * 경로 판정의 경계값은 website-analytics.test.ts 가 본다.
 *
 * vitest 기본 환경은 node 라 이 파일만 jsdom 을 쓴다. 외부 서비스(posthog, supabase)는 전부 모킹한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ANALYTICS_CHOICE_COOKIE, ANALYTICS_CHOICE_KEY } from "@/lib/website-analytics";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  posthog: {
    init: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    set_config: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    stopSessionRecording: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("posthog-js", () => ({ default: mocks.posthog }));
vi.mock("@/lib/supabase-client", () => ({
  createSupabaseClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  }),
}));
vi.mock("@/lib/posthog-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/posthog-config")>()),
  postHogConfig: () => ({ token: "phc_test", host: "https://us.i.posthog.com", environment: "staging" }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

/** 컴포넌트 안의 `initialized` 는 모듈 변수라 케이스마다 새로 불러온다. */
async function mount(pathname: string, stored: "granted" | "denied" | null) {
  mocks.pathname = pathname;
  window.localStorage.clear();
  if (stored) window.localStorage.setItem(ANALYTICS_CHOICE_KEY, stored);
  vi.resetModules();
  const { WebsiteAnalytics } = await import("@/components/WebsiteAnalytics");
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(WebsiteAnalytics)); });
  // 저장된 선택은 마이크로태스크로 읽는다.
  await act(async () => { await Promise.resolve(); });
  return container;
}

const card = (c: HTMLElement) => c.querySelector("aside");
const buttonByText = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
const cookie = () => document.cookie.split("; ").find((p) => p.startsWith(`${ANALYTICS_CHOICE_COOKIE}=`));

async function click(button: HTMLButtonElement | undefined) {
  expect(button, "클릭할 버튼이 있어야 한다").toBeDefined();
  await act(async () => { button!.click(); });
}

describe("응시 중 화면의 첫 동의 카드 (#538)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = `${ANALYTICS_CHOICE_COOKIE}=; Path=/; Max-Age=0; Secure`;
  });
  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = null;
    document.body.innerHTML = "";
  });

  describe("선택 기록이 없을 때", () => {
    it.each(["/exam/ABC123", "/assignment/ABC123", "/student/session/s-1/quiz"])(
      "%s 에서는 카드도 pill 도 없다",
      async (path) => {
        const c = await mount(path, null);
        expect(card(c)).toBeNull();
        expect(c.querySelector("button")).toBeNull();
        expect(c.innerHTML).toBe("");
      },
    );

    it("/exam/ABC123 은 기록이 없는 동안 거부 상태다 — 쿠키 denied, 캡처 시작 없음, 기록도 만들지 않는다", async () => {
      await mount("/exam/ABC123", null);
      expect(cookie()).toBe(`${ANALYTICS_CHOICE_COOKIE}=denied`);
      expect(mocks.posthog.init).not.toHaveBeenCalled();
      expect(mocks.posthog.opt_in_capturing).not.toHaveBeenCalled();
      expect(mocks.posthog.set_config).not.toHaveBeenCalled();
      expect(mocks.posthog.capture).not.toHaveBeenCalled();
      // 카드를 안 보여 줬다고 선택을 대신 적지 않는다. 다른 페이지에서 처음 묻는다.
      expect(window.localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBeNull();
    });

    it("대조군: 같은 화면에서 이미 granted 면 캡처가 시작된다", async () => {
      await mount("/exam/ABC123", "granted");
      expect(cookie()).toBe(`${ANALYTICS_CHOICE_COOKIE}=granted`);
      expect(mocks.posthog.init).toHaveBeenCalledTimes(1);
      expect(mocks.posthog.opt_in_capturing).toHaveBeenCalled();
    });

    it.each(["/student", "/sign-in", "/", "/assignment/ABC123/review", "/instructor/abc", "/legal/privacy"])(
      "%s 같은 일반 지원 페이지에서는 기존대로 카드가 뜬다",
      async (path) => {
        const c = await mount(path, null);
        const aside = card(c);
        expect(aside, path).not.toBeNull();
        expect(aside!.getAttribute("aria-label")).toBe("title");
        expect(buttonByText(c, "decline")).toBeDefined();
        expect(buttonByText(c, "allow")).toBeDefined();
        // 카드를 띄운 것과 별개로 선택 전에는 캡처하지 않는다.
        expect(mocks.posthog.init).not.toHaveBeenCalled();
        expect(cookie()).toBe(`${ANALYTICS_CHOICE_COOKIE}=denied`);
      },
    );

    it("일반 지원 페이지에서 분석 허용을 누르면 기록하고 캡처를 시작한다 (기존 동작)", async () => {
      const c = await mount("/student", null);
      await click(buttonByText(c, "allow"));
      expect(window.localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe("granted");
      expect(mocks.posthog.init).toHaveBeenCalledTimes(1);
      expect(card(c)).toBeNull();
      expect(buttonByText(c, "settings")).toBeDefined();
    });

    it("지원하지 않는 경로에서는 어디서든 아무것도 그리지 않는다", async () => {
      const c = await mount("/auth/callback", null);
      expect(c.innerHTML).toBe("");
    });
  });

  describe.each(["granted", "denied"] as const)("이미 %s 를 선택한 사용자가 응시 화면에 있을 때", (stored) => {
    it("pill 이 보이고 카드는 없다", async () => {
      const c = await mount("/exam/ABC123", stored);
      expect(card(c)).toBeNull();
      expect(buttonByText(c, "settings")).toBeDefined();
    });

    it("pill 을 누르면 설정 패널이 열리고 다시 고를 수 있다", async () => {
      const c = await mount("/exam/ABC123", stored);
      await click(buttonByText(c, "settings"));
      expect(card(c)).not.toBeNull();
      expect(buttonByText(c, "decline")).toBeDefined();
      expect(buttonByText(c, "allow")).toBeDefined();

      await click(buttonByText(c, "decline"));
      expect(window.localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe("denied");
      expect(card(c)).toBeNull();
      expect(buttonByText(c, "settings")).toBeDefined();
      expect(cookie()).toBe(`${ANALYTICS_CHOICE_COOKIE}=denied`);
    });
  });

  it("직접 연 설정 패널은 다른 탭이 기록을 지워도 사용자가 닫을 때까지 남는다", async () => {
    const c = await mount("/exam/ABC123", "granted");
    await click(buttonByText(c, "settings"));
    expect(card(c)).not.toBeNull();

    await act(async () => {
      window.localStorage.removeItem(ANALYTICS_CHOICE_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: ANALYTICS_CHOICE_KEY }));
    });
    // 기록은 비었지만 사용자가 연 패널이다. 억제는 "열지 않은 첫 카드"에만 적용된다.
    expect(window.localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBeNull();
    expect(card(c)).not.toBeNull();
  });
});
