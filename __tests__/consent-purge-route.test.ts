import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const purgeExpiredConsentRecords = vi.fn();
const recordPurgeRun = vi.fn();
const logError = vi.fn();
vi.mock("@/lib/consent-retention", () => ({
  purgeExpiredConsentRecords,
  recordPurgeRun,
}));
vi.mock("@/lib/logger", () => ({ logError }));

import { GET } from "@/app/api/cron/consent-retention/route";

const ORIGINAL_ENV = process.env;
function request(secret?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/consent-retention", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("consent retention cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, CRON_SECRET: "cron" };
    recordPurgeRun.mockResolvedValue(undefined);
  });

  it("returns 401 without CRON_SECRET and never calls purge", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request())).status).toBe(401);
    expect(purgeExpiredConsentRecords).not.toHaveBeenCalled();
  });

  it("returns 401 for a mismatched CRON_SECRET and never calls purge", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(purgeExpiredConsentRecords).not.toHaveBeenCalled();
  });

  it("exits disabled runs with zero deletions", async () => {
    process.env.CONSENT_RETENTION_PURGE_DISABLED = "1";
    const response = await GET(request("cron"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deletedCount: 0, disabled: true });
    expect(purgeExpiredConsentRecords).not.toHaveBeenCalled();
    expect(recordPurgeRun).toHaveBeenCalledWith(expect.objectContaining({ status: "dry-run", deletedCount: 0 }));
  });

  it("passes dry-run mode to the RPC", async () => {
    process.env.CONSENT_RETENTION_PURGE_MODE = "dry-run";
    purgeExpiredConsentRecords.mockResolvedValueOnce({ candidateCount: 3, deletedCount: 0 });
    await GET(request("cron"));
    expect(purgeExpiredConsentRecords).toHaveBeenCalledWith({ dryRun: true });
  });

  it("fails closed for an invalid mode", async () => {
    process.env.CONSENT_RETENTION_PURGE_MODE = "dryr-un";
    const response = await GET(request("cron"));
    expect(response.status).toBe(500);
    expect(purgeExpiredConsentRecords).not.toHaveBeenCalled();
    expect(recordPurgeRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("records successful and failed runs", async () => {
    process.env.CONSENT_RETENTION_PURGE_MODE = "delete";
    purgeExpiredConsentRecords.mockResolvedValueOnce({ candidateCount: 1, deletedCount: 1 });
    await GET(request("cron"));
    expect(recordPurgeRun).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));

    vi.clearAllMocks();
    recordPurgeRun.mockResolvedValue(undefined);
    purgeExpiredConsentRecords.mockRejectedValueOnce(new Error("failure"));
    expect((await GET(request("cron"))).status).toBe(500);
    expect(recordPurgeRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
