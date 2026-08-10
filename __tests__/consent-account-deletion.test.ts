import { describe, beforeEach, expect, it, vi } from "vitest";

// vi.mock 은 파일 최상단으로 호이스팅되므로 팩토리가 일반 const 를 볼 수 없다.
// vi.hoisted 로 함께 끌어올려야 참조가 성립한다.
const { currentUser, deleteUser, retireConsentSubject, logError, from } = vi.hoisted(
  () => ({
    currentUser: vi.fn(),
    deleteUser: vi.fn(),
    retireConsentSubject: vi.fn(),
    logError: vi.fn(),
    from: vi.fn(),
  }),
);
vi.mock("@/lib/get-current-user", () => ({ currentUser }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({ auth: { admin: { deleteUser } }, from }),
}));
vi.mock("@/lib/consent-retention", () => ({ retireConsentSubject }));
vi.mock("@/lib/logger", () => ({ logError }));

import { DELETE } from "@/app/api/user/account/route";

describe("DELETE /api/user/account", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests before any retirement RPC", async () => {
    currentUser.mockResolvedValueOnce(null);
    expect((await DELETE()).status).toBe(401);
    expect(retireConsentSubject).not.toHaveBeenCalled();
  });

  it("does not retire consent when auth deletion fails", async () => {
    currentUser.mockResolvedValueOnce({ id: "user-1" });
    deleteUser.mockResolvedValueOnce({ error: new Error("failed") });
    expect((await DELETE()).status).toBe(500);
    expect(retireConsentSubject).not.toHaveBeenCalled();
  });

  it("retires consent only after auth deletion succeeds", async () => {
    currentUser.mockResolvedValueOnce({ id: "user-1" });
    deleteUser.mockResolvedValueOnce({ error: null });
    retireConsentSubject.mockResolvedValueOnce(true);
    expect((await DELETE()).status).toBe(200);
    expect(retireConsentSubject).toHaveBeenCalledWith("user-1");
    expect(from).not.toHaveBeenCalled();
  });
  it("never directly mutates consent_records", async () => {
    const { readFileSync } = await import("fs");
    const source = readFileSync("app/api/user/account/route.ts", "utf8");
    expect(source).not.toMatch(/consent_records[\s\S]*(delete|update)|(delete|update)[\s\S]*consent_records/);
  });
});
