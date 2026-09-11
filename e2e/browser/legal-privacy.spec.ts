import { test, expect } from "@playwright/test";

/**
 * AC-D3 (live) — 처리방침의 필수 고지가 **화면에 실제로 보이는지** 확인한다.
 *
 * JSON 에만 넣고 페이지가 안 읽으면 공개 의무를 이행한 게 아니다.
 * 정적 테스트는 렌더 참조가 있는지만 보고, 여기서는 진짜 DOM 텍스트를 본다.
 *
 * DB 를 건드리지 않으므로 로컬 DB 조건이 필요 없다. 공개 페이지만 읽는다.
 */

const PROCESSORS = [
  "OpenAI OpCo, LLC",
  "Supabase Pte. Ltd",
  "Vercel Inc.",
  "Upstash, Inc.",
] as const;

for (const locale of ["ko", "en"] as const) {
  test.describe(`/legal/privacy (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/legal/privacy`, { waitUntil: "domcontentloaded" });
      await page.evaluate((l) => {
        document.cookie = `NEXT_LOCALE=${l}; path=/`;
      }, locale);
      await page.reload({ waitUntil: "domcontentloaded" });
    });

    test("로그인 없이 열린다", async ({ page }) => {
      // 동의하려면 약관을 봐야 하고 약관을 보려면 동의해야 하는 교착 방지.
      expect(page.url()).toContain("/legal/privacy");
      await expect(page.locator("body")).toBeVisible();
    });

    test("수탁자 네 곳의 법인명이 화면에 보인다", async ({ page }) => {
      const body = await page.locator("body").innerText();
      for (const name of PROCESSORS) {
        expect(body, `${name} 이 화면에 없다`).toContain(name);
      }
    });

    test("범주명 플레이스홀더가 남아 있지 않다", async ({ page }) => {
      const body = await page.locator("body").innerText();
      for (const placeholder of ["TBD", "vendor", "provider"]) {
        expect(body.toLowerCase()).not.toContain(placeholder.toLowerCase());
      }
    });

    test("국외이전 공개항목이 모두 보인다", async ({ page }) => {
      const body = await page.locator("body").innerText();
      // 수령자 명칭·연락처·국가·시기·방법이 빠지면 공개 의무 미이행이다.
      expect(body).toContain("privacy@openai.com");
      expect(body).toContain("privacy@supabase.io");
      expect(body).toContain("privacy@upstash.com");
      expect(body).toMatch(/Singapore|싱가포르/);
      expect(body.length).toBeGreaterThan(500);
    });
  });
}

test.describe("/legal/privacy — 금지 문구", () => {
  test("사실과 다른 문구가 남아 있지 않다", async ({ page }) => {
    await page.goto("/legal/privacy", { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();

    // 실제로는 교수자에게 성적과 AI 대화 전문을 제공한다.
    expect(body).not.toContain("제3자에게 제공하지 않습니다");
    // 기관 계약 개념이 코드에 없으므로 보존 기준으로 쓸 수 없다.
    expect(body).not.toContain("기관 계약 종료");
  });
});
