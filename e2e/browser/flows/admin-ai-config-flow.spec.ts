import { test, expect } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import { AdminLoginPage } from "../pages/AdminLoginPage";

/**
 * 관리자 AI 설정 화면 플로우 (이슈 #118, AC-19)
 *
 * 이 화면의 계약은 "최소 범위" 다: 편집 폼 + 서버 검증 에러 + 현재 버전 표시.
 * 버전 목록·diff·롤백 버튼·적용 현황은 **일부러 만들지 않았다**(후속 이슈).
 * 그래서 여기서는 있어야 할 것이 있는지와 함께, 없어야 할 것이 없는지도 본다.
 *
 * 상속 의미론이 UI 의 핵심이다: 입력을 비우면 상위 값을 물려받고, 값을 넣으면
 * 그 태스크만 덮어쓴다. 이걸 UI 가 뭉개면 첫 저장에 기본값이 영구히 굳는다.
 */

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "pw";

test.describe.configure({ mode: "serial" });

// 관리자 로그인 라우트에는 레이트리밋이 걸려 있다. 테스트마다 로그인하면
// 뒤쪽 테스트가 429 로 밀려 로그인 자체가 실패한다. 파일당 한 번만 로그인하고
// 세션 쿠키를 저장해 이후 테스트가 재사용한다.
const STORAGE = path.join(os.tmpdir(), "qo-admin-ai-config-state.json");

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const login = new AdminLoginPage(page);
  await login.goto();
  await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30_000 });
  await ctx.storageState({ path: STORAGE });
  await ctx.close();
});

test("비로그인 상태로는 설정 화면에 접근할 수 없다", async ({ browser }) => {
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  await page.goto("/admin/ai-config");
  // 로그인 화면으로 밀리거나 최소한 설정 폼이 보이면 안 된다.
  await expect(page.getByLabel(/^bulk_grading_worker-model$/)).toHaveCount(0);
  await fresh.close();
});

test.describe("인증된 관리자", () => {
  test.use({ storageState: STORAGE });

  test("설정 화면이 현재 버전과 태스크별 편집 폼을 렌더한다", async ({ page }) => {
  await page.goto("/admin/ai-config");

  // 현재 production 버전이 보여야 롤백 판단이 가능하다.
  await expect(page.getByText(/[0-9a-f]{8}-[0-9a-f]{4}-/i).first()).toBeVisible({
    timeout: 20_000,
  });

  // 7개 태스크가 모두 편집 가능해야 한다. 하나라도 빠지면 그 경로만 통제 불능이다.
  for (const task of [
    "auto_grading_question",
    "auto_grading_question_summary",
    "auto_grading_summary",
    "bulk_grading_score_cluster",
    "bulk_grading_criteria_extract",
    "bulk_grading_worker",
    "assignment_chat_stream",
  ]) {
    await expect(page.getByText(task, { exact: true })).toBeVisible();
  }
});

test("모든 프로필 필드가 편집 가능하다", async ({ page }) => {
  await page.goto("/admin/ai-config");

  for (const field of [
    "model",
    "timeoutMs",
    "maxRetries",
    "maxTokens",
    "temperature",
    "reasoningEffort",
  ]) {
    await expect(page.locator(`#bulk_grading_worker-${field}`)).toBeVisible({
      timeout: 20_000,
    });
  }
});

test("사유 없이는 저장할 수 없다", async ({ page }) => {
  await page.goto("/admin/ai-config");

  const save = page.getByRole("button", { name: /저장|Save/i });
  await expect(save).toBeVisible({ timeout: 20_000 });
  // 감사 로그에 사유가 남지 않는 변경 경로가 생기면 안 된다.
  await expect(save).toBeDisabled();

  await page.locator("#ai-config-reason").fill("browser flow check");
  await expect(save).toBeEnabled();
});

test("서버 검증 에러가 화면에 그대로 노출된다", async ({ page }) => {
  await page.goto("/admin/ai-config");
  await expect(page.locator("#bulk_grading_worker-maxRetries")).toBeVisible({
    timeout: 20_000,
  });

  // 범위를 벗어난 값 — 서버가 거부해야 하고, 그 이유가 사용자에게 보여야 한다.
  await page.locator("#bulk_grading_worker-maxRetries").fill("9");
  await page.locator("#ai-config-reason").fill("invalid retry count");
  await page.getByRole("button", { name: /저장|Save/i }).click();

  await expect(page.getByText(/maxRetries/i).first()).toBeVisible({ timeout: 20_000 });
});

test("연기된 화면(히스토리·diff·롤백)은 노출되지 않는다", async ({ page }) => {
  await page.goto("/admin/ai-config");
  await expect(page.getByRole("button", { name: /저장|Save/i })).toBeVisible({
    timeout: 20_000,
  });

  // 최소 범위 계약. 있으면 만들다 만 기능을 사용자에게 보여 주는 셈이다.
  await expect(page.getByRole("button", { name: /롤백|rollback/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /diff/i })).toHaveCount(0);
});
});
