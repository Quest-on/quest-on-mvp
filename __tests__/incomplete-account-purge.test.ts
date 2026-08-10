import { describe, expect, it, vi } from "vitest";
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => ({ from }) }));

import {
  getFirstPolicyReleaseEffectiveAt,
  getIncompleteAccountPurgeCutoff,
  selectIncompleteAccountCandidates,
  type AuthAccountCandidate,
} from "@/lib/incomplete-account-purge";

const cutoff = "2026-08-10T00:00:00.000Z";
const firstRelease = "2026-08-01T00:00:00.000Z";
const incomplete = vi.fn().mockResolvedValue({ complete: false });
const complete = vi.fn().mockResolvedValue({ complete: true });

async function select(users: AuthAccountCandidate[], evaluateGate = incomplete) {
  return selectIncompleteAccountCandidates({
    users,
    cutoff,
    firstPolicyReleaseEffectiveAt: firstRelease,
    evaluateGate: evaluateGate as never,
  });
}

describe("incomplete auth account candidate selection", () => {
  it("protects an auth user created before the first policy release", async () => {
    await expect(select([{ id: "existing", created_at: "2026-07-31T23:59:59.999Z" }])).resolves.toEqual([]);
    expect(incomplete).not.toHaveBeenCalled();
  });

  it("excludes a user whose required consent is complete", async () => {
    await expect(select([{ id: "complete", created_at: "2026-08-02T00:00:00.000Z" }], complete)).resolves.toEqual([]);
  });

  it("excludes an account younger than seven days", async () => {
    await expect(select([{ id: "recent", created_at: "2026-08-03T00:00:00.001Z" }])).resolves.toEqual([]);
  });

  it("includes an incomplete account exactly on the seven-day boundary", async () => {
    await expect(select([{ id: "boundary", created_at: cutoff }])).resolves.toEqual([
      { id: "boundary", created_at: cutoff },
    ]);
  });

  it("fails closed with no candidate when the first policy release lookup fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: new Error("unavailable") });
    const order = vi.fn(() => ({ limit }));
    const selectRelease = vi.fn(() => ({ order }));
    from.mockReturnValue({ select: selectRelease });

    const unavailableRelease = await getFirstPolicyReleaseEffectiveAt();
    expect(unavailableRelease).toBeNull();
    await expect(
      selectIncompleteAccountCandidates({
        users: [{ id: "unknown-release", created_at: "2026-08-02T00:00:00.000Z" }],
        cutoff,
        firstPolicyReleaseEffectiveAt: unavailableRelease,
        evaluateGate: incomplete as never,
      })
    ).resolves.toEqual([]);
  });

  it("selects only users meeting all three conditions", async () => {
    const evaluateGate = vi.fn(async (userId: string) => ({ complete: userId === "complete" }));
    await expect(
      selectIncompleteAccountCandidates({
        cutoff,
        firstPolicyReleaseEffectiveAt: firstRelease,
        evaluateGate: evaluateGate as never,
        users: [
          { id: "before-release", created_at: "2026-07-31T00:00:00.000Z" },
          { id: "complete", created_at: "2026-08-02T00:00:00.000Z" },
          { id: "recent", created_at: "2026-08-03T00:00:00.001Z" },
          { id: "candidate", created_at: "2026-08-02T00:00:00.000Z" },
        ],
      })
    ).resolves.toEqual([{ id: "candidate", created_at: "2026-08-02T00:00:00.000Z" }]);
  });

  it("is idempotent after the first run deletes its selected auth account", async () => {
    const remainingUsers = [{ id: "candidate", created_at: "2026-08-02T00:00:00.000Z" }];
    expect(await select(remainingUsers)).toHaveLength(1);
    remainingUsers.splice(0, 1);
    await expect(select(remainingUsers)).resolves.toEqual([]);
  });

  it("calculates the cutoff as exactly seven 24-hour periods", () => {
    expect(getIncompleteAccountPurgeCutoff(new Date("2026-08-10T00:00:00.000Z"))).toBe(cutoff);
  });
});
