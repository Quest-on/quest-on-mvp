import { test, expect } from "@playwright/test";
import { assertLocalTestEnv } from "../helpers/assert-local-test-env";
import { getTestSupabase } from "../helpers/supabase-test-client";

/**
 * AC-O1 / AC-O2 / AC-O3 (live) — 탈퇴 가명보존과 3년 파기를 실제 DB 로 검증한다.
 *
 * 이건 되돌릴 수 없는 작업이라 경계가 정확해야 한다. 특히 3년을 일 수 상수로
 * 계산하면 윤년에서 어긋나므로, 달력 기준인지를 실제 값으로 확인한다.
 */

test.beforeAll(() => {
  assertLocalTestEnv();
});

const supabase = getTestSupabase();

const RELEASE = "consent-e2e-retention-r1";
const USER = "consent-e2e-retention-user";

test.describe("탈퇴와 보존", () => {
  test.beforeAll(async () => {
    await supabase.from("consent_policy_releases").insert({
      release_id: RELEASE,
      content_hash: "b".repeat(64),
      effective_at: new Date("2020-01-01T00:00:00Z").toISOString(),
      requires_reconsent: true,
    });
  });

  test("탈퇴는 매핑만 지우고 원장은 남긴다", async () => {
    const subjectRef = "v1:" + "1".repeat(64);

    await supabase.rpc("register_consent_subject", {
      p_user_id: USER,
      p_subject_ref: subjectRef,
    });
    await supabase.from("consent_records").insert({
      subject_ref: subjectRef,
      consent_key: "terms",
      granted: true,
      policy_version: RELEASE,
    });

    const { data: retired } = await supabase.rpc("retire_consent_subject", {
      p_user_id: USER,
    });
    expect(retired).toBe(true);

    // 원 user_id 로는 더 이상 찾을 수 없어야 한다.
    const { data: mapping } = await supabase
      .from("consent_subject_map")
      .select("user_id")
      .eq("user_id", USER);
    expect(mapping ?? []).toHaveLength(0);

    // 그러나 동의 사실 자체는 남아 있어야 한다.
    const { data: rows } = await supabase
      .from("consent_records")
      .select("id")
      .eq("subject_ref", subjectRef);
    expect((rows ?? []).length).toBeGreaterThan(0);
  });

  test("보존 기한이 달력 기준 3년으로 기록된다", async () => {
    const { data } = await supabase
      .from("consent_retention_index")
      .select("deleted_at, destroy_after")
      .eq("subject_ref", "v1:" + "1".repeat(64))
      .single();

    expect(data).toBeTruthy();

    const deletedAt = new Date(data!.deleted_at);
    const destroyAfter = new Date(data!.destroy_after);
    const expected = new Date(deletedAt);
    expected.setUTCFullYear(expected.getUTCFullYear() + 3);

    // 1095일 상수를 썼다면 윤년이 낀 구간에서 하루가 어긋난다.
    expect(Math.abs(destroyAfter.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  test("기한 전 dry-run 은 아무것도 삭제하지 않는다", async () => {
    const { data } = await supabase.rpc("purge_expired_consent_records", {
      p_dry_run: true,
      p_limit: 100,
    });

    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.deleted_count ?? 0).toBe(0);
  });

  test("기한이 도래하지 않은 주체는 후보에 들지 않는다", async () => {
    const { data } = await supabase
      .from("consent_retention_index")
      .select("subject_ref")
      .lte("destroy_after", new Date().toISOString());

    // 방금 만든 3년짜리 항목이 즉시 만료 후보로 잡히면 경계 계산이 틀린 것이다.
    expect((data ?? []).map((r) => r.subject_ref)).not.toContain(
      "v1:" + "1".repeat(64),
    );
  });
});
