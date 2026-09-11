import { test, expect } from "@playwright/test";
import { assertLocalTestEnv } from "../helpers/assert-local-test-env";
import { getTestSupabase } from "../helpers/supabase-test-client";

/**
 * AC-S4 (live) — 019 의 불변식이 **DB 에서 실제로** 강제되는지 확인한다.
 *
 * 정적 테스트(`__tests__/consent-migration-safety.test.ts`)는 SQL 텍스트만 본다.
 * 여기서는 진짜 Postgres 에 붙어 trigger 와 권한이 동작하는지 본다.
 * 마이그레이션이 적용되지 않았거나 trigger 가 빠진 채 배포되는 사고를 잡는다.
 */

// DB 안전 멈춤 규칙. 세 조건 없이는 아예 붙지 않는다.
test.beforeAll(() => {
  assertLocalTestEnv();
});

const supabase = getTestSupabase();

const TEST_RELEASE = "consent-e2e-schema-r1";
const TEST_SUBJECT = "v1:" + "e".repeat(64);

async function seedRelease() {
  await supabase.from("consent_policy_releases").insert({
    release_id: TEST_RELEASE,
    content_hash: "a".repeat(64),
    effective_at: new Date("2020-01-01T00:00:00Z").toISOString(),
    requires_reconsent: true,
  });
}

test.describe("consent schema — live 불변식", () => {
  test.beforeAll(async () => {
    await seedRelease();
  });

  test("원장에 INSERT 한 행은 UPDATE 할 수 없다", async () => {
    const { data: inserted, error: insertError } = await supabase
      .from("consent_records")
      .insert({
        subject_ref: TEST_SUBJECT,
        consent_key: "terms",
        granted: true,
        policy_version: TEST_RELEASE,
      })
      .select("id")
      .single();

    expect(insertError).toBeNull();
    expect(inserted?.id).toBeTruthy();

    // append-only 는 애플리케이션 규율이 아니라 DB 제약이어야 한다.
    const { error: updateError } = await supabase
      .from("consent_records")
      .update({ granted: false })
      .eq("id", inserted!.id);

    expect(updateError).not.toBeNull();
    expect(updateError?.message).toContain("append-only");
  });

  test("원장 행을 일반 경로로 DELETE 할 수 없다", async () => {
    const { error } = await supabase
      .from("consent_records")
      .delete()
      .eq("subject_ref", TEST_SUBJECT);

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/retention purge/i);
  });

  test("정책 릴리스는 UPDATE·DELETE 를 모두 거부한다", async () => {
    const { error: updateError } = await supabase
      .from("consent_policy_releases")
      .update({ requires_reconsent: false })
      .eq("release_id", TEST_RELEASE);
    expect(updateError).not.toBeNull();

    const { error: deleteError } = await supabase
      .from("consent_policy_releases")
      .delete()
      .eq("release_id", TEST_RELEASE);
    expect(deleteError).not.toBeNull();
  });

  test("controller_type 은 platform 외 값을 거부한다", async () => {
    const { error } = await supabase.from("consent_records").insert({
      subject_ref: TEST_SUBJECT,
      controller_type: "institution",
      consent_key: "terms",
      granted: true,
      policy_version: TEST_RELEASE,
    });

    expect(error).not.toBeNull();
  });

  test("존재하지 않는 정책 버전은 FK 로 거부된다", async () => {
    const { error } = await supabase.from("consent_records").insert({
      subject_ref: TEST_SUBJECT,
      consent_key: "terms",
      granted: true,
      policy_version: "consent-does-not-exist-r1",
    });

    expect(error).not.toBeNull();
  });

  test("보존 인덱스는 3년이 아닌 destroy_after 를 거부한다", async () => {
    const deletedAt = new Date("2026-01-01T00:00:00Z");
    const wrong = new Date("2027-01-01T00:00:00Z"); // 1년

    const { error } = await supabase.from("consent_retention_index").insert({
      subject_ref: TEST_SUBJECT,
      deleted_at: deletedAt.toISOString(),
      destroy_after: wrong.toISOString(),
    });

    expect(error).not.toBeNull();
  });
});
