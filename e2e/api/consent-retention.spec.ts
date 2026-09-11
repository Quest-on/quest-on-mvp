import { test, expect } from "@playwright/test";
import { assertLocalTestEnv } from "../helpers/assert-local-test-env";
import { getTestSupabase } from "../helpers/supabase-test-client";
import { PrismaClient } from "@prisma/client";

/**
 * AC-O1 / AC-O2 / AC-O3 (live) — 탈퇴 가명보존과 3년 파기를 실제 DB 로 검증한다.
 *
 * 이건 되돌릴 수 없는 작업이라 경계가 정확해야 한다. 특히 3년을 일 수 상수로
 * 계산하면 윤년에서 어긋나므로, 달력 기준인지를 실제 값으로 확인한다.
 */

test.afterAll(async () => {
  await prisma.$disconnect();
});
test.beforeAll(() => {
  assertLocalTestEnv();
});

const supabase = getTestSupabase();
const prisma = new PrismaClient();

async function queryRows<T>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql);
}

async function execute(sql: string): Promise<void> {
  await prisma.$executeRawUnsafe(sql);
}


const RELEASE = "consent-20260810-r1";
const USER = "consent-e2e-retention-user";

test.describe("탈퇴와 보존", () => {

  test("탈퇴는 매핑만 지우고 원장은 남긴다", async () => {
    const subjectRef = "v1:" + "1".repeat(64);

    await supabase.rpc("register_consent_subject", {
      p_user_id: USER,
      p_subject_ref: subjectRef,
    });
    await execute(`
      INSERT INTO public.consent_records
        (subject_ref, consent_key, granted, policy_version)
      VALUES
        ('${subjectRef}', 'terms', true, '${RELEASE}')
    `);

    const { data: retired } = await supabase.rpc("retire_consent_subject", {
      p_user_id: USER,
    });
    expect(retired).toBe(true);

    // 원 user_id 로는 더 이상 찾을 수 없어야 한다.
    const mapping = await queryRows<{ user_id: string }>(`
      SELECT user_id
        FROM public.consent_subject_map
       WHERE user_id = '${USER}'
    `);
    expect(mapping).toHaveLength(0);

    // 그러나 동의 사실 자체는 남아 있어야 한다.
    const rows = await queryRows<{ id: string }>(`
      SELECT id::text
        FROM public.consent_records
       WHERE subject_ref = '${subjectRef}'
    `);
    expect(rows.length).toBeGreaterThan(0);
  });

  test("보존 기한이 달력 기준 3년으로 기록된다", async () => {
    const [data] = await queryRows<{
      deleted_at: Date;
      destroy_after: Date;
    }>(`
      SELECT deleted_at, destroy_after
        FROM public.consent_retention_index
       WHERE subject_ref = 'v1:${"1".repeat(64)}'
    `);

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
    const data = await queryRows<{ subject_ref: string }>(`
      SELECT subject_ref
        FROM public.consent_retention_index
       WHERE destroy_after <= now()
    `);

    // 방금 만든 3년짜리 항목이 즉시 만료 후보로 잡히면 경계 계산이 틀린 것이다.
    expect(data.map((r) => r.subject_ref)).not.toContain("v1:" + "1".repeat(64));
  });
});

test.describe("보존 만료 경계와 재실행", () => {
  const EXPIRED_SUBJECT = "v1:" + "2".repeat(64);

  test.beforeAll(async () => {
    // 이미 3년이 지난 주체를 직접 만든다. CHECK 제약을 지키려면
    // deleted_at 과 destroy_after 가 정확히 3년 차이여야 한다.
    const deletedAt = new Date();
    deletedAt.setUTCFullYear(deletedAt.getUTCFullYear() - 4);
    const destroyAfter = new Date(deletedAt);
    destroyAfter.setUTCFullYear(destroyAfter.getUTCFullYear() + 3);

    await execute(`
      INSERT INTO public.consent_records
        (subject_ref, consent_key, granted, policy_version)
      VALUES
        ('${EXPIRED_SUBJECT}', 'terms', true, '${RELEASE}')
    `);
    await execute(`
      INSERT INTO public.consent_retention_index
        (subject_ref, deleted_at, destroy_after)
      VALUES
        ('${EXPIRED_SUBJECT}', '${deletedAt.toISOString()}', '${destroyAfter.toISOString()}')
      ON CONFLICT (subject_ref) DO UPDATE
        SET deleted_at = EXCLUDED.deleted_at,
            destroy_after = EXCLUDED.destroy_after
    `);
  });

  test("dry-run 은 후보를 세되 삭제하지 않는다", async () => {
    const { data } = await supabase.rpc("purge_expired_consent_records", {
      p_dry_run: true,
      p_limit: 100,
    });
    const row = Array.isArray(data) ? data[0] : data;

    expect(row?.candidate_count ?? 0).toBeGreaterThan(0);
    expect(row?.deleted_count ?? 0).toBe(0);

    // 원장이 그대로여야 한다.
    const rows = await queryRows<{ id: string }>(`
      SELECT id::text
        FROM public.consent_records
       WHERE subject_ref = '${EXPIRED_SUBJECT}'
    `);
    expect(rows.length).toBeGreaterThan(0);
  });

  test("경계가 지난 주체는 삭제되고 재실행은 0건이다", async () => {
    const { data: first } = await supabase.rpc("purge_expired_consent_records", {
      p_dry_run: false,
      p_limit: 100,
    });
    const firstRow = Array.isArray(first) ? first[0] : first;
    expect(firstRow?.deleted_count ?? 0).toBeGreaterThan(0);

    const rows = await queryRows<{ id: string }>(`
      SELECT id::text
        FROM public.consent_records
       WHERE subject_ref = '${EXPIRED_SUBJECT}'
    `);
    expect(rows).toHaveLength(0);

    // 멱등성 — 바로 다시 돌려도 지울 게 없어야 한다.
    const { data: second } = await supabase.rpc("purge_expired_consent_records", {
      p_dry_run: false,
      p_limit: 100,
    });
    const secondRow = Array.isArray(second) ? second[0] : second;
    expect(secondRow?.deleted_count ?? 0).toBe(0);
  });
});

test.describe("접근 분리", () => {
  test("service_role 은 매핑을 PostgREST 로 직접 읽지 못한다", async () => {
    const { data, error } = await supabase
      .from("consent_subject_map")
      .select("user_id")
      .limit(1);

    expect(data).toBeNull();
    expect(error?.message ?? "").toMatch(/permission denied/i);
  });
});
