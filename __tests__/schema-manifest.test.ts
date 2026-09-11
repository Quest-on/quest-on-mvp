import { beforeEach, describe, expect, it, vi } from "vitest";

// getSupabaseServer 를 훅으로 잡아 DB 없이 스키마 검사 분류를 검증한다.
const tableErrors = new Map<string, { code: string; message: string }>();
const columnErrors = new Map<string, { code: string; message: string }>();
const rpcErrors = new Map<string, { code: string; message: string }>();

const supabaseMock = {
  from: vi.fn((table: string) => ({
    select: vi.fn((columns: string) => ({
      limit: vi.fn(() =>
        Promise.resolve({
          data: [{ secret: "must not be returned" }],
          error: tableErrors.get(table) ?? columnErrors.get(`${table}.${columns}`) ?? null,
        })
      ),
    })),
  })),
  rpc: vi.fn((name: string) =>
    Promise.resolve({
      data: name === "admit_exam_session" ? [{ denial_reason: "exam_not_found" }] : null,
      error: rpcErrors.get(name) ?? null,
    })
  ),
};

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

import { auditSchema, isSchemaAuditHealthy } from "@/lib/schema-manifest";

beforeEach(() => {
  tableErrors.clear();
  columnErrors.clear();
  rpcErrors.clear();
  supabaseMock.from.mockClear();
  supabaseMock.rpc.mockClear();
});

describe("schema manifest", () => {
  it("모든 필수 객체가 있으면 healthy 이고 누락 목록은 비어 있다", async () => {
    const audit = await auditSchema();

    expect(audit).toEqual({
      missingTables: [],
      missingColumns: [],
      missingFunctions: [],
    });
    expect(isSchemaAuditHealthy(audit)).toBe(true);
  });

  it("없는 테이블을 missingTables 에 기록한다", async () => {
    tableErrors.set("ai_config_labels", {
      code: "PGRST205",
      message: "Could not find the table 'public.ai_config_labels' in the schema cache",
    });

    const audit = await auditSchema();

    expect(audit.missingTables).toEqual(["ai_config_labels"]);
    expect(isSchemaAuditHealthy(audit)).toBe(false);
  });

  it("없는 컬럼을 table.column 형식으로 기록한다", async () => {
    columnErrors.set("ai_events.config_version", {
      code: "PGRST204",
      message: "Could not find the 'config_version' column of 'ai_events' in the schema cache",
    });

    const audit = await auditSchema();

    expect(audit.missingColumns).toEqual(["ai_events.config_version"]);
  });

  it("PGRST202 RPC 오류를 missingFunctions 에 기록한다", async () => {
    rpcErrors.set("admit_exam_session", {
      code: "PGRST202",
      message: "Could not find the function public.admit_exam_session in the schema cache",
    });

    const audit = await auditSchema();

    expect(audit.missingFunctions).toEqual(["admit_exam_session"]);
  });

  it("exam_not_found 정상 응답은 RPC 누락이 아니다", async () => {
    const audit = await auditSchema();

    expect(audit.missingFunctions).toEqual([]);
  });

  it("감사 결과에는 객체 이름만 담고 행 내용은 담지 않는다", async () => {
    tableErrors.set("onboarding_events", {
      code: "PGRST205",
      message: "Could not find the table 'public.onboarding_events' in the schema cache",
    });

    const audit = await auditSchema();

    expect(JSON.stringify(audit)).not.toContain("must not be returned");
    expect(audit).toEqual({
      missingTables: ["onboarding_events"],
      missingColumns: [],
      missingFunctions: [],
    });
  });
});
