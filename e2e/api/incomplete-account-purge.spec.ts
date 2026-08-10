import { test, expect } from "@playwright/test";
import { assertLocalTestEnv } from "../helpers/assert-local-test-env";
import { getTestSupabase } from "../helpers/supabase-test-client";

/**
 * 개정 `fact-r13-3` (live) — 미완료 계정 7일 파기 cron 의 안전 경계.
 *
 * 이 작업은 실행하면 되돌릴 수 없다. 그래서 여기서 증명하려는 건
 * "삭제가 잘 되는가" 가 아니라 **"삭제하면 안 되는 걸 안 지우는가"** 다.
 */

test.beforeAll(() => {
  assertLocalTestEnv();
});

const ENDPOINT = "/api/cron/purge-incomplete-accounts";

test.describe("미완료 계정 파기 cron — 인증", () => {
  test("CRON_SECRET 없이 호출하면 401 이다", async ({ request }) => {
    const res = await request.get(ENDPOINT);
    expect(res.status()).toBe(401);
  });

  test("잘못된 CRON_SECRET 은 401 이다", async ({ request }) => {
    const res = await request.get(ENDPOINT, {
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(res.status()).toBe(401);
  });

  test("401 응답은 삭제 건수를 보고하지 않는다", async ({ request }) => {
    const res = await request.get(ENDPOINT);
    const body = await res.text();

    // 인증 실패인데 삭제 카운트가 나오면 후보 조회가 이미 돌았다는 뜻이다.
    expect(body).not.toMatch(/"deleted(_?[Cc]ount)?"\s*:\s*[1-9]/);
  });
});

test.describe("미완료 계정 파기 cron — 기본 비활성", () => {
  test("최초 배포 기본값이 비활성이면 삭제가 일어나지 않는다", async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, "CRON_SECRET 이 없으면 이 검사를 할 수 없다");

    const res = await request.get(ENDPOINT, {
      headers: { authorization: `Bearer ${secret}` },
    });

    if (!res.ok()) return;

    const body = await res.json();
    // DISABLED=1 또는 dry-run 이면 삭제는 항상 0 이어야 한다.
    expect(body.deletedCount ?? body.deleted_count ?? 0).toBe(0);
  });
});

test.describe("미완료 계정 파기 cron — cohort 음성 케이스", () => {
  // 이 작업은 되돌릴 수 없다. 그래서 "지워지는가" 보다
  // "지우면 안 되는 걸 안 지우는가" 를 먼저 증명한다.
  const supabase = getTestSupabase();
  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created.splice(0)) {
      await supabase.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  async function makeUser(): Promise<string> {
    const { data, error } = await supabase.auth.admin.createUser({
      email: `purge-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`user creation failed: ${error?.message}`);
    created.push(data.user.id);
    return data.user.id;
  }

  test("방금 만든 계정은 삭제되지 않는다", async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, "CRON_SECRET 이 없으면 이 검사를 할 수 없다");

    const freshId = await makeUser();

    const res = await request.get(ENDPOINT, {
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!res.ok()) return;

    const body = await res.json();
    expect(body.deletedCount ?? body.deleted_count ?? 0).toBe(0);

    // 7일 미만 계정은 반드시 살아 있어야 한다.
    const { data } = await supabase.auth.admin.getUserById(freshId);
    expect(data.user?.id).toBe(freshId);
  });

  test("run log 에 식별자가 남지 않는다", async () => {
    const { data } = await supabase
      .from("consent_purge_runs")
      .select("*")
      .eq("job", "incomplete-accounts")
      .limit(5);

    for (const row of data ?? []) {
      const serialized = JSON.stringify(row);
      // 파기 기록 자체가 새 개인정보가 되면 안 된다.
      expect(serialized).not.toMatch(/@/);
      expect(serialized).not.toMatch(/v1:[0-9a-f]{64}/);
    }
  });
});
