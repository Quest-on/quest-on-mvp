import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => ({ rpc, from }) }));

import {
  purgeExpiredConsentRecords,
  recordPurgeRun,
  retireConsentSubject,
} from "@/lib/consent-retention";

describe("consent retention RPC wrappers", () => {
  it("retires only through the retire_consent_subject RPC", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(retireConsentSubject("user-1")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("retire_consent_subject", { p_user_id: "user-1" });
    expect(from).not.toHaveBeenCalled();
  });

  it("passes the default dry-run value directly to the purge RPC", async () => {
    rpc.mockResolvedValueOnce({ data: [{ candidate_count: 2, deleted_count: 0 }], error: null });
    await expect(purgeExpiredConsentRecords()).resolves.toEqual({ candidateCount: 2, deletedCount: 0 });
    expect(rpc).toHaveBeenCalledWith("purge_expired_consent_records", { p_dry_run: true, p_limit: 500 });
  });

  it("records aggregate counts without identifiers", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValueOnce({ insert });
    await recordPurgeRun({ job: "consent-retention", cutoff: "2026-01-01T00:00:00.000Z", candidateCount: 2, deletedCount: 1, status: "partial" });
    const row = insert.mock.calls[0][0];
    expect(row).not.toHaveProperty("user_id");
    expect(row).not.toHaveProperty("subject_ref");
    expect(row).not.toHaveProperty("email");
  });

  it("does not calculate the three-year boundary with a day constant", async () => {
    const { readFileSync } = await import("fs");
    const source = readFileSync("lib/consent-retention.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(source).not.toMatch(/1095|365\s*\*\s*3/);
  });
});
