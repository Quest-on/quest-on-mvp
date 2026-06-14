import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  extractSupabaseRef,
  decodeJwtRef,
  extractDatabaseRef,
  assertSupabaseTarget,
  assertNotProd,
  assertStagingTarget,
} from "@/lib/env-target";

/** ref/role 을 담은 가짜 Supabase JWT 생성 (서명은 검증하지 않으므로 더미) */
function makeJwt(ref: string, role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "supabase", ref, role })).toString("base64url");
  return `${header}.${payload}.sig`;
}

const PROD_REF = "fmhpwotcfshoqpdhzqqj";
const STAGING_REF = "stagingref0000abcd";
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

describe("ref 추출", () => {
  it("URL 에서 ref 추출", () => {
    expect(extractSupabaseRef(PROD_URL)).toBe(PROD_REF);
    expect(extractSupabaseRef("https://Abc123.supabase.co/x")).toBe("abc123");
    expect(extractSupabaseRef(undefined)).toBeNull();
    expect(extractSupabaseRef("not a url")).toBeNull();
  });

  it("JWT payload 에서 ref 추출", () => {
    expect(decodeJwtRef(makeJwt(PROD_REF, "service_role"))).toBe(PROD_REF);
    expect(decodeJwtRef(makeJwt(STAGING_REF, "anon"))).toBe(STAGING_REF);
    expect(decodeJwtRef("garbage")).toBeNull();
    expect(decodeJwtRef(undefined)).toBeNull();
  });

  it("DATABASE_URL 에서 ref 추출 (pooler/direct)", () => {
    expect(
      extractDatabaseRef(
        `postgresql://postgres.${PROD_REF}:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`
      )
    ).toBe(PROD_REF);
    expect(extractDatabaseRef(`postgresql://postgres:pw@db.${STAGING_REF}.supabase.co:5432/postgres`)).toBe(
      STAGING_REF
    );
    expect(extractDatabaseRef(undefined)).toBeNull();
  });
});

describe("assertSupabaseTarget", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.EXPECTED_SUPABASE_REF;
    delete process.env.NEXT_PUBLIC_EXPECTED_SUPABASE_REF;
    delete process.env.TARGET_ENV;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("URL ref 와 service-role 키 ref 가 다르면 throw", () => {
    expect(() =>
      assertSupabaseTarget({
        url: STAGING_URL,
        serviceRoleKey: makeJwt(PROD_REF, "service_role"),
        context: "server",
      })
    ).toThrow(/service-role/);
  });

  it("URL ref 와 DATABASE_URL ref 가 다르면 throw", () => {
    expect(() =>
      assertSupabaseTarget({
        url: STAGING_URL,
        databaseUrl: `postgresql://postgres.${PROD_REF}:pw@aws-0.pooler.supabase.com:5432/postgres`,
        context: "server",
      })
    ).toThrow(/DATABASE_URL/);
  });

  it("EXPECTED_SUPABASE_REF 와 실제 ref 가 다르면 throw (fail-closed)", () => {
    process.env.EXPECTED_SUPABASE_REF = STAGING_REF;
    expect(() => assertSupabaseTarget({ url: PROD_URL, context: "server" })).toThrow(/기대 Supabase ref/);
  });

  it("EXPECTED_SUPABASE_REF 와 실제 ref 가 같으면 통과", () => {
    process.env.EXPECTED_SUPABASE_REF = STAGING_REF;
    expect(() =>
      assertSupabaseTarget({
        url: STAGING_URL,
        serviceRoleKey: makeJwt(STAGING_REF, "service_role"),
        context: "server",
      })
    ).not.toThrow();
  });

  it("EXPECTED 미설정 + TARGET_ENV=local 이면 통과(예외)", () => {
    process.env.TARGET_ENV = "local";
    expect(() => assertSupabaseTarget({ url: PROD_URL, context: "server" })).not.toThrow();
  });

  it("URL 누락이면 호출자에게 위임(throw 안 함)", () => {
    expect(() => assertSupabaseTarget({ url: undefined, context: "server" })).not.toThrow();
  });

  it("client context 는 NEXT_PUBLIC_EXPECTED_SUPABASE_REF 로 검증", () => {
    process.env.NEXT_PUBLIC_EXPECTED_SUPABASE_REF = STAGING_REF;
    expect(() => assertSupabaseTarget({ url: PROD_URL, context: "client" })).toThrow(/기대 Supabase ref/);
    expect(() => assertSupabaseTarget({ url: STAGING_URL, context: "client" })).not.toThrow();
  });
});

describe("스크립트용 가드", () => {
  it("assertNotProd: prod denylist 에 있으면 throw", () => {
    expect(() => assertNotProd(PROD_URL, [PROD_REF])).toThrow(/denylist/);
    expect(() => assertNotProd(STAGING_URL, [PROD_REF])).not.toThrow();
    expect(() => assertNotProd(undefined, [PROD_REF])).toThrow();
  });

  it("assertStagingTarget: confirmRef 불일치면 throw", () => {
    expect(() => assertStagingTarget(STAGING_URL, PROD_REF)).toThrow(/staging 확인 ref/);
    expect(() => assertStagingTarget(STAGING_URL, STAGING_REF)).not.toThrow();
  });
});
