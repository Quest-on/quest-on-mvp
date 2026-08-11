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

// 이 파일은 `production` 라벨이라는 **공유 가변 상태**를 옮긴다. API 프로젝트는
// 완전 병렬로 돌기 때문에(e2e/playwright.config.ts) 병렬로 두면 발행 테스트끼리
// 서로의 라벨을 덮어써 위양성·위음성이 모두 난다. 파일 단위 직렬로 고정한다.
test.describe.configure({ mode: "serial" });

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
  // 남의 행을 빌려 쓰면 병렬 테스트와 충돌하고, 없으면 skip 으로 조용히 통과한다.
  // 둘 다 검증을 무의미하게 만들므로 이 파일이 소유하는 행을 직접 만든다.
  const OWNER = "e2e-ai-config";
  let ownedSessionId: string | null = null;
  let productionVersionId: string | null = null;

  test.beforeAll(async () => {
    const { data: label } = await supabase
      .from("ai_config_labels")
      .select("version_id")
      .eq("label", "production")
      .single();
    productionVersionId = (label?.version_id as string) ?? null;

    // exams.code 와 exams.duration 은 non-null 이다(prisma/schema.prisma).
    // 빠뜨리면 insert 가 조용히 실패하고, serial 모드에서는 뒤 테스트가 전부 안 돈다.
    const uniqueCode = `E2EAI${Date.now().toString(36).toUpperCase().slice(-6)}`;

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .insert({
        title: "e2e-ai-config-pin",
        code: uniqueCode,
        duration: 60,
        status: "draft",
        questions: [],
        instructor_id: OWNER,
      })
      .select("id")
      .single();

    // 에러를 삼키면 픽스처가 없는 채로 아래 검증이 무의미하게 통과한다.
    expect(examError).toBeNull();
    expect(exam?.id).toBeTruthy();

    const { data: session, error: sessionError } = await supabase
      .from("exam_grading_sessions")
      .insert({ exam_id: exam?.id, instructor_id: OWNER, status: "draft" })
      .select("id")
      .single();

    expect(sessionError).toBeNull();
    ownedSessionId = (session?.id as string) ?? null;
  });

  test.afterAll(async () => {
    if (ownedSessionId) {
      await supabase.from("exam_grading_sessions").delete().eq("id", ownedSessionId);
    }
    await supabase.from("exams").delete().eq("instructor_id", OWNER);
  });

  test("픽스처가 실제로 만들어졌다", async () => {
    // 이게 없으면 아래 두 검증이 조용히 무의미해진다.
    expect(ownedSessionId).toBeTruthy();
    expect(productionVersionId).toBeTruthy();
  });

  test("버전만 있고 스냅샷이 없는 반쪽 핀은 저장할 수 없다", async () => {
    // 짝 CHECK 가 없으면 워커가 "핀이 있다" 고 믿고 잘못된 프로필로 채점한다.
    const { error } = await supabase
      .from("exam_grading_sessions")
      .update({ ai_config_version_id: productionVersionId, ai_profile_snapshot: null })
      .eq("id", ownedSessionId as string);

    expect(error).not.toBeNull();
  });

  test("스냅샷만 있고 버전이 없는 반대쪽 반쪽 핀도 막힌다", async () => {
    const { error } = await supabase
      .from("exam_grading_sessions")
      .update({ ai_config_version_id: null, ai_profile_snapshot: { bulk_grading_worker: {} } })
      .eq("id", ownedSessionId as string);

    expect(error).not.toBeNull();
  });

  test("버전과 스냅샷을 함께 쓰면 통과한다", async () => {
    // 짝 제약이 정상적인 핀까지 막으면 채점을 아예 시작할 수 없다.
    const { data, error } = await supabase
      .from("exam_grading_sessions")
      .update({
        ai_config_version_id: productionVersionId,
        ai_profile_snapshot: {
          bulk_grading_worker: { model: "gpt-5.6-luna", timeoutMs: 120000, maxRetries: 2 },
        },
      })
      .eq("id", ownedSessionId as string)
      .select("id, ai_config_version_id");

    expect(error).toBeNull();
    // 업데이트가 실제로 소유한 행에 적용됐는지 확인한다 — 0행 업데이트도 error 는 null 이다.
    expect(data?.[0]?.id).toBe(ownedSessionId);
    expect(data?.[0]?.ai_config_version_id).toBe(productionVersionId);
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
