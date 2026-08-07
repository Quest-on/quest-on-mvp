/**
 * `/student/profile-setup` 소비 지점 회귀 테스트 (PR #89 리뷰 P2).
 *
 * 헬퍼 단위 테스트가 아니라 **페이지가 실제로 어디로 보내는지**를 검사한다.
 * 리뷰 지적은 "쿼리스트링을 버린다"였고, 그건 헬퍼가 아니라 이 페이지의 동작이다.
 *
 * Next 의 `redirect()` 는 NEXT_REDIRECT 에러를 throw 하는 방식이라, 목으로
 * 목적지를 가로채 검사한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const redirectCalls: string[] = [];

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectCalls.push(url);
    // 실제 구현과 같은 제어 흐름(throw)을 흉내 낸다.
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

async function callPage(
  params: Record<string, string | string[] | undefined>
): Promise<string> {
  const { default: Page } = await import(
    "../app/(app)/student/profile-setup/page"
  );
  await expect(
    Page({ searchParams: Promise.resolve(params) })
  ).rejects.toThrow(/NEXT_REDIRECT/);
  return redirectCalls[redirectCalls.length - 1];
}

beforeEach(() => {
  redirectCalls.length = 0;
});

describe("StudentProfileSetupPage", () => {
  it("redirect 파라미터를 /onboarding 으로 그대로 넘긴다 — 응시 중 복귀 경로", async () => {
    expect(await callPage({ redirect: "/exam/ABC" })).toBe(
      "/onboarding?redirect=%2Fexam%2FABC"
    );
  });

  it("쿼리가 없으면 그냥 /onboarding 이다", async () => {
    expect(await callPage({})).toBe("/onboarding");
  });

  it("여러 파라미터와 배열 값도 보존한다", async () => {
    const target = await callPage({ redirect: "/exam/ABC", tab: ["a", "b"] });
    const query = new URL(target, "https://quest-on.app").searchParams;
    expect(query.get("redirect")).toBe("/exam/ABC");
    expect(query.getAll("tab")).toEqual(["a", "b"]);
  });

  it("값이 undefined 인 키는 빈 값으로 만들지 않고 버린다", async () => {
    expect(await callPage({ redirect: undefined })).toBe("/onboarding");
  });

  it("전달만 하고 판정하지 않는다 — 검증은 소비 지점(/onboarding)의 책임", async () => {
    // 여기서 걸러내면 검증이 두 곳으로 갈라진다. 목적지에서 safeInternalPath 로 막는다.
    const target = await callPage({ redirect: "//evil.com" });
    expect(new URL(target, "https://quest-on.app").pathname).toBe("/onboarding");
  });
});
