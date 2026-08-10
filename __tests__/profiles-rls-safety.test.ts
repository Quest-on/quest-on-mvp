import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Windows 체크아웃(core.autocrlf=true)에서는 파일이 CRLF 로 내려온다. 아래 단언들은
// 줄바꿈을 \n 으로 고정한 정규식이라, 정규화하지 않으면 CI(리눅스)만 통과하고
// 개발자 로컬에서는 항상 실패한다 — 신호가 아니라 소음이 된다.
const root = path.resolve(__dirname, "..");
const readText = (relative: string) =>
  readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");

describe("profiles RLS migration safety", () => {
  it("applies 019 atomically with profiles RLS and no client write grants", () => {
    const migration = readText("database/019_profiles_rls.sql");

    expect(migration).toMatch(/^BEGIN;$/m);
    expect(migration).toMatch(/^COMMIT;$/m);
    expect(migration).toContain("ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;");
    expect(migration).toContain(
      "REVOKE ALL ON public.profiles FROM anon, authenticated;"
    );
    expect(migration).toContain(
      "GRANT SELECT ON public.profiles TO anon, authenticated;"
    );
    expect(migration).toMatch(
      /CREATE POLICY "profiles_select_own" ON public\.profiles\n  FOR SELECT TO authenticated\n  USING \(\(select auth\.uid\(\)\) = id\);/
    );

    // 019 가 스테이징에서 실패한 실제 버그다. profiles.id 는 uuid 라서
    // auth.uid()(uuid)에 ::text 를 걸면 text = uuid 비교가 되어 적용이 거절된다.
    // 정책 문자열을 고정하는 것만으로는 못 잡는다 — 타입 캐스트 자체를 금지한다.
    expect(migration).not.toMatch(/auth\.uid\(\)\)\)::text/);
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?FOR UPDATE/);
    expect(migration).toMatch(
      /CREATE POLICY "service_role_all" ON public\.profiles\n  FOR ALL TO service_role USING \(true\) WITH CHECK \(true\);/
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;'
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "service_role_all" ON public.profiles;'
    );
  });

  it("applies 019 with ON_ERROR_STOP", () => {
    const testSetup = readText(".github/actions/test-setup/action.yml");

    expect(testSetup).toMatch(
      /psql postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres \\\n+\s+-v ON_ERROR_STOP=1 \\\n+\s+-f database\/019_profiles_rls\.sql/
    );
  });

  it("revokes profiles after the blanket grant", () => {
    const testSetup = readText(".github/actions/test-setup/action.yml");
    const blanketGrant = "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;";
    const profilesRevoke = "REVOKE ALL ON public.profiles FROM anon, authenticated;";

    expect(testSetup.indexOf(blanketGrant)).toBeGreaterThanOrEqual(0);
    expect(testSetup.indexOf(profilesRevoke)).toBeGreaterThan(testSetup.indexOf(blanketGrant));
  });
});
