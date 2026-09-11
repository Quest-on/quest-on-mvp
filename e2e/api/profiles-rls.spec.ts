import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalTestEnv } from "../helpers/assert-local-test-env";
import { getTestSupabase } from "../helpers/supabase-test-client";

/**
 * `profiles` 직접 권한 상승 차단. (#148)
 *
 * `profiles` 는 Prisma 모델이 아니라 Supabase Auth 프로필용 raw 테이블이다.
 * `public` 스키마의 표준 GRANT 만으로도 `anon` 키를 가진 로그인 사용자가
 * PostgREST 로 `role`/`status`/`plan` 을 직접 PATCH 해 라우트의 입력 검증을
 * 우회할 수 있다. 학생이 스스로 instructor 가 되는 경로다.
 *
 * `database/019_profiles_rls.sql` 이 RLS 와 권한을 고정한다. 하지만 그걸
 * 검증하는 테스트가 없었다 — REVOKE 를 적어 놓고도 blanket GRANT 로 다시
 * 열린 채 배포되는 사고를 잡을 방법이 없었다. `#250` 의 로컬 셋업에서
 * 실제로 그 일이 났다(blanket GRANT 가 경계를 열었다).
 *
 * live DB 를 직접 두드린다. 소스 문자열 검사로는 증명되지 않는다.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  // DB 안전 멈춤 규칙. 세 조건 없이는 아예 붙지 않는다.
  assertLocalTestEnv();
});

const PROBE_ID = "rls-probe-instructor-id";

/** anon 키 클라이언트. 로그인한 일반 사용자가 가진 권한과 같다. */
function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("anon 키가 없다");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("profiles — 직접 권한 상승 차단", () => {
  test.afterAll(async () => {
    await getTestSupabase().from("profiles").delete().eq("id", PROBE_ID);
  });

  test("anon 이 프로필을 새로 만들 수 없다", async () => {
    const { error } = await anonClient()
      .from("profiles")
      .insert({ id: PROBE_ID, role: "instructor", status: "active" });

    // 권한 자체가 없어야 한다. 성공하면 아무나 instructor 행을 만들 수 있다.
    expect(error, "anon INSERT 가 성공했다 — 권한 상승 가능").not.toBeNull();
  });

  test("anon 이 남의 role 을 instructor 로 바꿀 수 없다", async () => {
    const admin = getTestSupabase();
    await admin
      .from("profiles")
      .upsert({ id: PROBE_ID, role: "student", status: "active" });

    const { error } = await anonClient()
      .from("profiles")
      .update({ role: "instructor" })
      .eq("id", PROBE_ID);

    expect(error, "anon UPDATE 가 성공했다 — 학생이 스스로 교수가 된다").not.toBeNull();

    // 실제로 안 바뀌었는지도 본다. 오류를 냈지만 반영된 경우를 잡는다.
    const { data } = await admin
      .from("profiles")
      .select("role")
      .eq("id", PROBE_ID)
      .maybeSingle();
    expect(data?.role, "role 이 바뀌었다").toBe("student");
  });

  test("anon 이 plan 을 올릴 수 없다", async () => {
    const admin = getTestSupabase();
    await admin.from("profiles").upsert({ id: PROBE_ID, role: "student", status: "active" });

    const { error } = await anonClient()
      .from("profiles")
      .update({ plan: "pro" })
      .eq("id", PROBE_ID);

    expect(error, "anon 이 plan 을 바꿨다 — 유료 한도 우회").not.toBeNull();
  });

  test("anon 이 프로필을 지울 수 없다", async () => {
    const admin = getTestSupabase();
    await admin.from("profiles").upsert({ id: PROBE_ID, role: "student", status: "active" });

    const { error } = await anonClient().from("profiles").delete().eq("id", PROBE_ID);
    expect(error, "anon DELETE 가 성공했다").not.toBeNull();
  });

  test("service_role 은 계속 쓸 수 있다", async () => {
    // 차단만 확인하면 테이블을 통째로 잠가도 통과한다. 반대편 증거를 둔다.
    const { error } = await getTestSupabase()
      .from("profiles")
      .upsert({ id: PROBE_ID, role: "student", status: "active" });
    expect(error, "service_role 쓰기가 막혔다 — 앱이 동작하지 않는다").toBeNull();
  });
});
