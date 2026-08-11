import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AC-U1 / AC-U3 / AC-U4 — 동의 원장 기록 계약.
 *
 * 잡으려는 사고:
 *   · 2행을 두 번 나눠 INSERT 해서 부분 성공이 생기는 것
 *   · 철회를 UPDATE 로 처리해 "언제 동의했나" 를 지우는 것
 *   · 미설정(unset)을 granted=false 로 백필해 거부와 뒤섞는 것
 *   · 클라이언트가 controller_type / subject_ref 를 덮어쓰는 것
 */

const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

/** Supabase 호출을 기록하는 가짜 클라이언트. */
function makeSupabaseSpy() {
  const insertCalls: unknown[][] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const updateCalls: unknown[] = [];
  const upsertCalls: unknown[] = [];
  const deleteCalls: unknown[] = [];
  let selectRows: Record<string, unknown>[] = [];
  let insertShouldFail = false;

  const client = {
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return { data: (args as { p_subject_ref: string }).p_subject_ref, error: null };
    }),
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};

      builder.insert = vi.fn((rows: unknown[]) => {
        insertCalls.push(rows);
        return {
          select: vi.fn(async () =>
            insertShouldFail
              ? { data: null, error: { message: "boom" } }
              : { data: rows.map((_, i) => ({ id: `row-${i}` })), error: null },
          ),
        };
      });

      builder.update = vi.fn((v: unknown) => {
        updateCalls.push(v);
        return builder;
      });
      builder.upsert = vi.fn((v: unknown) => {
        upsertCalls.push(v);
        return builder;
      });
      builder.delete = vi.fn((v: unknown) => {
        deleteCalls.push(v);
        return builder;
      });

      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.in = vi.fn(() => builder);
      builder.order = vi.fn(() => builder);
      builder.lte = vi.fn(() => builder);
      builder.limit = vi.fn(async () => ({ data: selectRows, error: null }));
      // .order() 로 끝나는 조회(getLatestConsentDecisions)를 위해 thenable 로 둔다.
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: selectRows, error: null });

      return builder;
    }),
  };

  return {
    client,
    insertCalls,
    rpcCalls,
    updateCalls,
    upsertCalls,
    deleteCalls,
    setSelectRows: (rows: Record<string, unknown>[]) => {
      selectRows = rows;
    },
    failInsert: () => {
      insertShouldFail = true;
    },
  };
}

describe("consent-records", () => {
  const ORIGINAL_ENV = { ...process.env };
  let spy: ReturnType<typeof makeSupabaseSpy>;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV, CONSENT_SUBJECT_HMAC_KEY_V1: VALID_KEY };
    spy = makeSupabaseSpy();
    vi.doMock("@/lib/supabase-server", () => ({
      getSupabaseServer: () => spy.client,
    }));
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.doUnmock("@/lib/supabase-server");
  });

  async function load() {
    return await import("@/lib/consent-records");
  }

  it("AC-U1 — 필수 2건을 단일 배열 INSERT 로 기록한다", async () => {
    const { recordConsentDecisions, REQUIRED_CONSENT_KEYS } = await load();

    await recordConsentDecisions(
      "user-alpha",
      REQUIRED_CONSENT_KEYS.map((k) => ({ consentKey: k, granted: true })),
      "consent-20260810-r1",
    );

    // 나눠 쓰면 부분 성공이 생긴다. INSERT 는 정확히 1회여야 한다.
    expect(spy.insertCalls).toHaveLength(1);
    expect(spy.insertCalls[0]).toHaveLength(2);
  });

  it("AC-U1 — 저장 행이 서버가 정한 값만 담는다", async () => {
    const { recordConsentDecisions } = await load();
    const { deriveSubjectRef } = await import("@/lib/consent-subject-ref");

    await recordConsentDecisions(
      "user-alpha",
      [{ consentKey: "terms", granted: true }],
      "consent-20260810-r1",
    );

    const row = (spy.insertCalls[0] as Record<string, unknown>[])[0];
    expect(row.subject_ref).toBe(deriveSubjectRef("user-alpha"));
    expect(row.controller_type).toBe("platform");
    expect(row.policy_version).toBe("consent-20260810-r1");
    expect(row.granted).toBe(true);
  });

  it("AC-U1 — 저장 행에 user_id·source·ip_hash·user_agent 가 없다", async () => {
    const { recordConsentDecisions } = await load();

    await recordConsentDecisions(
      "user-alpha",
      [{ consentKey: "terms", granted: true }],
      "consent-20260810-r1",
    );

    const row = (spy.insertCalls[0] as Record<string, unknown>[])[0];
    for (const forbidden of ["user_id", "source", "ip_hash", "user_agent"]) {
      expect(Object.keys(row)).not.toContain(forbidden);
    }
  });

  it("매핑 등록은 insert-once RPC 로만 한다", async () => {
    const { recordConsentDecisions } = await load();

    await recordConsentDecisions(
      "user-alpha",
      [{ consentKey: "terms", granted: true }],
      "consent-20260810-r1",
    );

    expect(spy.rpcCalls.map((c) => c.fn)).toContain("register_consent_subject");
    // 매핑 테이블에 직접 INSERT 하면 안 된다.
    // `from` 은 인자 없이도 호출될 수 있어 튜플 타입이 비어 있다. 안전하게 읽는다.
    const insertedTables = spy.client.from.mock.calls.map(
      (call) => (call as unknown as string[])[0],
    );
    expect(insertedTables).not.toContain("consent_subject_map");
  });

  it("AC-U3 — 철회는 granted=false 새 행이며 update/upsert/delete 를 쓰지 않는다", async () => {
    const { revokeConsent } = await load();

    await revokeConsent("user-alpha", "marketing", "consent-20260810-r1");

    expect(spy.insertCalls).toHaveLength(1);
    const row = (spy.insertCalls[0] as Record<string, unknown>[])[0];
    expect(row.granted).toBe(false);
    expect(row.consent_key).toBe("marketing");

    expect(spy.updateCalls).toHaveLength(0);
    expect(spy.upsertCalls).toHaveLength(0);
    expect(spy.deleteCalls).toHaveLength(0);
  });

  it("AC-U4 — 행이 없으면 unset 이다 (거부가 아니다)", async () => {
    spy.setSelectRows([]);
    const { getLatestConsentDecision } = await load();

    const decision = await getLatestConsentDecision("user-alpha", "marketing");
    expect(decision.state).toBe("unset");
  });

  it("AC-U4 — 선택 동의를 기록해도 false 백필이 생기지 않는다", async () => {
    const { recordConsentDecisions } = await load();

    // 필수 2건만 기록한다. 선택 3건은 건드리지 않는다.
    await recordConsentDecisions(
      "user-alpha",
      [
        { consentKey: "age_over_14", granted: true },
        { consentKey: "terms", granted: true },
      ],
      "consent-20260810-r1",
    );

    const rows = spy.insertCalls[0] as Record<string, unknown>[];
    const keys = rows.map((r) => r.consent_key);
    expect(keys).toEqual(["age_over_14", "terms"]);
    for (const optional of ["marketing", "ads_receive", "ai_training"]) {
      expect(keys).not.toContain(optional);
    }
  });

  it("AC-U6 — INSERT 실패는 성공으로 처리되지 않는다", async () => {
    spy.failInsert();
    const { recordConsentDecisions } = await load();

    await expect(
      recordConsentDecisions(
        "user-alpha",
        [{ consentKey: "terms", granted: true }],
        "consent-20260810-r1",
      ),
    ).rejects.toThrow(/동의 기록에 실패/);
  });

  it("빈 결정 배열은 거절한다", async () => {
    const { recordConsentDecisions } = await load();
    await expect(
      recordConsentDecisions("user-alpha", [], "consent-20260810-r1"),
    ).rejects.toThrow();
  });

  it("최신 결정을 읽을 때 과거 true 뒤 최신 false 면 false 가 이긴다", async () => {
    // recorded_at DESC 정렬 결과를 흉내낸다.
    spy.setSelectRows([
      {
        consent_key: "marketing",
        granted: false,
        policy_version: "consent-20260810-r1",
        recorded_at: "2026-08-10T00:00:00.000Z",
      },
      {
        consent_key: "marketing",
        granted: true,
        policy_version: "consent-20260810-r1",
        recorded_at: "2026-08-09T00:00:00.000Z",
      },
    ]);

    const { getLatestConsentDecisions } = await load();
    const map = await getLatestConsentDecisions("user-alpha", ["marketing"]);
    const decision = map.get("marketing");

    expect(decision?.state).toBe("recorded");
    expect(decision?.state === "recorded" && decision.granted).toBe(false);
  });

  it("알 수 없는 consent_key 는 타입 가드가 거른다", async () => {
    const { isConsentKey } = await load();
    expect(isConsentKey("terms")).toBe(true);
    expect(isConsentKey("age_over_14")).toBe(true);
    expect(isConsentKey("__injected__")).toBe(false);
    expect(isConsentKey("controller_type")).toBe(false);
  });
});
