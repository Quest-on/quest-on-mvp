import { test, expect } from "@playwright/test";
import { assertLocalTestEnv } from "../helpers/assert-local-test-env";
import { getTestSupabase } from "../helpers/supabase-test-client";

/**
 * 이슈 #118 (live) — 028/029/030 의 불변식이 **DB 에서 실제로** 강제되는지 확인한다.
 *
 * 정적 테스트(`__tests__/ai-config-migration-safety.test.ts`)는 SQL 텍스트만 본다:
 * 문장이 존재하고 순서가 맞는지. 여기서는 진짜 Postgres 에 붙어 권한과 제약이
 * 동작하는지 본다. REVOKE 를 적어 놓고도 blanket GRANT 로 다시 열린 채 배포되거나,
 * 짝 CHECK 가 실제로는 반쪽 핀을 통과시키는 사고를 잡는 게 목적이다.
 */

// DB 안전 멈춤 규칙. 세 조건 없이는 아예 붙지 않는다.
test.beforeAll(() => {
  assertLocalTestEnv();
});

const supabase = getTestSupabase();

test.describe("ai_config 스키마 — live 보안 경계", () => {
  test("production 라벨은 항상 하나이고 유효한 버전을 가리킨다", async () => {
    const { data, error } = await supabase
      .from("ai_config_labels")
      .select("label, version_id")
      .eq("label", "production");

    expect(error).toBeNull();
    // 028 의 부트스트랩이 정확히 하나를 만든다. 재적용해도 늘지 않아야 한다.
    expect(data).toHaveLength(1);
    expect(data?.[0]?.version_id).toBeTruthy();
  });

  test("부트스트랩 버전은 sparse 라서 아무 기본값도 물질화하지 않는다", async () => {
    const { data: label } = await supabase
      .from("ai_config_labels")
      .select("version_id")
      .eq("label", "production")
      .single();

    const { data: version } = await supabase
      .from("ai_config_versions")
      .select("profiles, created_by")
      .eq("id", label?.version_id as string)
      .single();

    // 여기에 값이 박혀 있으면 우선순위 의미가 첫 배포에 굳어 버린다.
    expect(version?.profiles).toEqual({});
    expect(version?.created_by).toBe("system:migration");
  });

  test("service_role 도 설정 테이블을 직접 쓸 수 없다 — RPC 만이 쓰기 경로다", async () => {
    // 직접 INSERT 가 통하면 감사 없는 변경 경로가 생긴다.
    const { error } = await supabase
      .from("ai_config_versions")
      .insert({ profiles: {}, created_by: "e2e:direct-write" });

    expect(error).not.toBeNull();
  });

  test("발행 RPC 는 버전을 만들고 라벨을 옮기고 감사를 남긴다 — 한 트랜잭션으로", async () => {
    const { data: before } = await supabase
      .from("ai_config_labels")
      .select("version_id")
      .eq("label", "production")
      .single();

    const { data, error } = await supabase.rpc("publish_ai_config_version", {
      p_profiles: { bulk_grading_worker: { temperature: 0 } },
      p_actor: "e2e:test",
      p_reason: "live spec",
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.new_version_id).toBeTruthy();
    expect(row?.previous_version_id).toBe(before?.version_id);

    const { data: after } = await supabase
      .from("ai_config_labels")
      .select("version_id")
      .eq("label", "production")
      .single();
    expect(after?.version_id).toBe(row?.new_version_id);

    const { data: audit } = await supabase
      .from("ai_config_audit")
      .select("actor, action, reason, previous_version_id, new_version_id")
      .eq("new_version_id", row?.new_version_id as string)
      .single();
    expect(audit?.actor).toBe("e2e:test");
    expect(audit?.action).toBe("publish");
    expect(audit?.reason).toBe("live spec");
    expect(audit?.previous_version_id).toBe(before?.version_id);
  });

  test("발행 RPC 는 사유 없이는 거부한다", async () => {
    const { error } = await supabase.rpc("publish_ai_config_version", {
      p_profiles: {},
      p_actor: "e2e:test",
      p_reason: "   ",
    });
    expect(error).not.toBeNull();
  });

  test("이전 버전 행은 발행 뒤에도 그대로 남는다 (불변 이력)", async () => {
    const { data: versions } = await supabase
      .from("ai_config_versions")
      .select("id")
      .order("created_at", { ascending: true });

    // 롤백은 라벨 이동이지 행 삭제가 아니다.
    expect((versions?.length ?? 0)).toBeGreaterThanOrEqual(2);
  });
});

test.describe("exam_grading_sessions 런 핀 — live 불변식", () => {
  test("버전만 있고 스냅샷이 없는 반쪽 핀은 저장할 수 없다", async () => {
    const { data: label } = await supabase
      .from("ai_config_labels")
      .select("version_id")
      .eq("label", "production")
      .single();

    const { data: session } = await supabase
      .from("exam_grading_sessions")
      .select("id")
      .limit(1)
      .maybeSingle();

    test.skip(!session, "채점 세션이 없으면 이 검증은 건너뛴다");

    // 짝 CHECK 가 없으면 워커가 "핀이 있다" 고 믿고 잘못된 프로필로 채점한다.
    const { error } = await supabase
      .from("exam_grading_sessions")
      .update({ ai_config_version_id: label?.version_id, ai_profile_snapshot: null })
      .eq("id", session?.id as string);

    expect(error).not.toBeNull();
  });

  test("스냅샷만 있고 버전이 없는 반대쪽 반쪽 핀도 막힌다", async () => {
    const { data: session } = await supabase
      .from("exam_grading_sessions")
      .select("id")
      .limit(1)
      .maybeSingle();

    test.skip(!session, "채점 세션이 없으면 이 검증은 건너뛴다");

    const { error } = await supabase
      .from("exam_grading_sessions")
      .update({ ai_config_version_id: null, ai_profile_snapshot: { bulk_grading_worker: {} } })
      .eq("id", session?.id as string);

    expect(error).not.toBeNull();
  });
});

test.describe("ai_events 설정 버전 스탬프 — live", () => {
  test("config_version 컬럼이 존재하고 버전 테이블을 참조한다", async () => {
    const { data: label } = await supabase
      .from("ai_config_labels")
      .select("version_id")
      .eq("label", "production")
      .single();

    // 존재하지 않는 버전을 찍으려 하면 FK 가 막아야 한다.
    const { error: fkError } = await supabase.from("ai_events").insert({
      provider: "openai",
      endpoint: "chat.completions",
      feature: "bulk_grading_chat",
      route: "e2e",
      model: "gpt-5.6-luna",
      status: "success",
      pricing_version: "e2e",
      config_version: "00000000-0000-4000-8000-000000000000",
    });
    expect(fkError).not.toBeNull();

    // 실제 버전은 통과해야 한다.
    const { error: okError } = await supabase.from("ai_events").insert({
      provider: "openai",
      endpoint: "chat.completions",
      feature: "bulk_grading_chat",
      route: "e2e",
      model: "gpt-5.6-luna",
      status: "success",
      pricing_version: "e2e",
      config_version: label?.version_id,
    });
    expect(okError).toBeNull();
  });
});
