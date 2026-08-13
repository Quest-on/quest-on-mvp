import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getFirstPolicyReleaseEffectiveAt,
  getIncompleteAccountPurgeCutoff,
  selectIncompleteAccountCandidates,
  recordPurgeRun,
  retireConsentSubject,
  logError,
} = vi.hoisted(() => ({
  getFirstPolicyReleaseEffectiveAt: vi.fn(),
  getIncompleteAccountPurgeCutoff: vi.fn(() => "2026-08-03T00:00:00.000Z"),
  selectIncompleteAccountCandidates: vi.fn(),
  recordPurgeRun: vi.fn(),
  retireConsentSubject: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/incomplete-account-purge", () => ({
  getFirstPolicyReleaseEffectiveAt,
  getIncompleteAccountPurgeCutoff,
  selectIncompleteAccountCandidates,
}));
vi.mock("@/lib/consent-retention", () => ({ recordPurgeRun, retireConsentSubject }));
vi.mock("@/lib/logger", () => ({ logError }));

import { GET } from "@/app/api/cron/purge-incomplete-accounts/route";

const ORIGINAL_ENV = process.env;
function request(secret?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/purge-incomplete-accounts", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("incomplete account purge cron configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, CRON_SECRET: "cron" };
    delete process.env.INCOMPLETE_ACCOUNT_PURGE_DISABLED;
    delete process.env.INCOMPLETE_ACCOUNT_PURGE_MODE;
    recordPurgeRun.mockResolvedValue(undefined);
    getFirstPolicyReleaseEffectiveAt.mockResolvedValue(null);
  });

  it("returns 401 without CRON_SECRET before candidate lookup", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request())).status).toBe(401);
    expect(getFirstPolicyReleaseEffectiveAt).not.toHaveBeenCalled();
    expect(selectIncompleteAccountCandidates).not.toHaveBeenCalled();
  });

  it("returns 401 for a mismatched CRON_SECRET before candidate lookup", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(getFirstPolicyReleaseEffectiveAt).not.toHaveBeenCalled();
    expect(selectIncompleteAccountCandidates).not.toHaveBeenCalled();
  });

  it("exits disabled runs with zero deletions", async () => {
    process.env.INCOMPLETE_ACCOUNT_PURGE_DISABLED = "1";
    const response = await GET(request("cron"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ disabled: true, deletedCount: 0 });
    expect(getFirstPolicyReleaseEffectiveAt).not.toHaveBeenCalled();
  });

  it("defaults to dry-run mode", async () => {
    const response = await GET(request("cron"));
    await expect(response.json()).resolves.toMatchObject({ status: "dry-run", deletedCount: 0 });
    expect(recordPurgeRun).toHaveBeenCalledWith(expect.objectContaining({ status: "dry-run" }));
    expect(retireConsentSubject).not.toHaveBeenCalled();
  });

  it("fails closed for an invalid mode", async () => {
    process.env.INCOMPLETE_ACCOUNT_PURGE_MODE = "dryr-un";
    const response = await GET(request("cron"));
    expect(response.status).toBe(500);
    expect(getFirstPolicyReleaseEffectiveAt).not.toHaveBeenCalled();
    expect(recordPurgeRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("records aggregate run data without identifier keys", async () => {
    await GET(request("cron"));
    const record = recordPurgeRun.mock.calls[0][0];
    expect(record).not.toHaveProperty("user_id");
    expect(record).not.toHaveProperty("userId");
    expect(record).not.toHaveProperty("email");
    expect(record).not.toHaveProperty("subject_ref");
  });
});
