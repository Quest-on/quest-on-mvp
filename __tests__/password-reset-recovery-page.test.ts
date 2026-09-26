/**
 * 복구 링크 확인 화면이 1회용 토큰을 밖으로 흘리지 않는다 (이슈 #318).
 *
 * 토큰은 폼의 hidden input 에 실려 있다. 분석에 동의한 사용자라면 이 화면도
 * 세션 리플레이가 녹화한다. rrweb 의 `maskAllInputs` 는 hidden 을 가리지
 * 않아서, 가리는 블록 안에 두지 않으면 **쓰지 않은 토큰이 리플레이 스냅샷에
 * 그대로 실린다.** 리플레이를 볼 수 있는 사람이 그 토큰으로 남의 비밀번호를
 * 바꿀 수 있다.
 *
 * 화면을 실제로 렌더해서 본다 — 소스 문자열로는 input 이 어느 요소 안에
 * 있는지 알 수 없다.
 */

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { sessionReplayConfig } from "@/lib/posthog-replay";

vi.mock("@/lib/password-reset-availability", () => ({ isPasswordResetEnabled: () => true }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const TOKEN_HASH = "a".repeat(56);

async function render(params: Record<string, string>): Promise<string> {
  const { default: Page } = await import("../app/auth/recovery/page");
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
}

/** 토큰 input 을 감싸는 요소들의 여는 태그 — 바깥쪽부터. */
function ancestorsOf(html: string, needle: string): string[] {
  const at = html.indexOf(needle);
  expect(at).toBeGreaterThan(-1);
  const stack: string[] = [];
  const tag = /<(\/?)([a-z][a-z0-9-]*)\b[^>]*?(\/?)>/gi;
  for (let m = tag.exec(html); m && m.index < at; m = tag.exec(html)) {
    const [open, closing, , selfClosing] = m;
    if (closing) stack.pop();
    else if (!selfClosing && !/^<(input|img|br|hr|meta|link|source)\b/i.test(open)) stack.push(open);
  }
  return stack;
}

describe("/auth/recovery — 토큰은 리플레이에 실리지 않는다", () => {
  it("리플레이는 [data-private] 을 통째로 막는다", () => {
    expect(sessionReplayConfig.blockSelector).toContain("[data-private]");
  });

  it("토큰 input 은 data-private 요소 안에 있다", async () => {
    const html = await render({ token_hash: TOKEN_HASH, type: "recovery" });
    const input = `value="${TOKEN_HASH}"`;

    expect(html).toContain(input);
    expect(ancestorsOf(html, input).some((open) => /\sdata-private(?:[\s=>])/.test(open))).toBe(true);
  });

  it("한도 안내로 되돌아왔을 때도 같다", async () => {
    const html = await render({ token_hash: TOKEN_HASH, type: "recovery", error: "rate_limited" });
    const input = `value="${TOKEN_HASH}"`;

    expect(ancestorsOf(html, input).some((open) => /\sdata-private(?:[\s=>])/.test(open))).toBe(true);
  });
});
