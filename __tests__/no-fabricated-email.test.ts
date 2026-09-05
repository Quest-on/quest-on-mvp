import { describe, expect, it, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const listUsers = vi.fn();
const profilesIn = vi.fn();
const supabaseMock = {
  auth: { admin: { listUsers } },
  from: vi.fn(() => ({
    select: vi.fn(() => ({ in: profilesIn })),
  })),
};

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

import { batchGetUserInfo } from "@/lib/app-users";

beforeEach(() => {
  listUsers.mockReset();
  profilesIn.mockReset();
  supabaseMock.from.mockClear();
});

describe("batchGetUserInfo", () => {
  it("인증 정보에 이메일이 없으면 null을 반환한다", async () => {
    listUsers.mockResolvedValue({ data: { users: [{ id: "student-1" }] } });
    profilesIn.mockResolvedValue({ data: [], error: null });

    const result = await batchGetUserInfo(["student-1"]);

    expect(result.get("student-1")).toEqual({ name: "User student-", email: null });
  });

  it("인증 조회가 실패해도 이메일은 null이고 이름 식별자는 유지한다", async () => {
    listUsers.mockRejectedValue(new Error("auth unavailable"));

    const result = await batchGetUserInfo(["student-1"]);

    expect(result.get("student-1")).toEqual({ name: "User student-", email: null });
  });

  it("인증 정보의 이메일을 그대로 반환한다", async () => {
    listUsers.mockResolvedValue({
      data: { users: [{ id: "student-1", email: "student@university.edu" }] },
    });
    profilesIn.mockResolvedValue({ data: [], error: null });

    const result = await batchGetUserInfo(["student-1"]);

    expect(result.get("student-1")?.email).toBe("student@university.edu");
  });
});

describe("이메일을 만들지 않는다", () => {
  it("프로덕션 소스에 example.com 이메일 생성이 없다", () => {
    const files = execSync("git ls-files app lib components", {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean);
    // 주석은 벷기고 검사한다. 이 가드가 잡아야 하는 건 가짜 주소를
    // **만드는 코드** 이지, 왜 만들지 않기로 했는지 설명하는 문장이 아니다.
    // 주석까지 금지하면 다음 사람이 이유를 모른 채 다시 날조하게 된다.
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    const offenders = files.filter((file) =>
      stripComments(readFileSync(resolve(root, file), "utf8")).includes("@example.com"),
    );

    expect(offenders).toEqual([]);
  });
});
