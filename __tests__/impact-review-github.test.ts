import { describe, expect, it } from "vitest";
import {
  upsertPrComment,
  upsertPushComment,
  type GitHubClient,
  type IssueComment,
} from "@/lib/impact-review/github-comments";
import { markerFor } from "@/lib/impact-review/format";

/** 인메모리 fake GitHub client. */
function fakeClient() {
  let seq = 1;
  const issue = new Map<number, IssueComment[]>();
  const commit = new Map<string, IssueComment[]>();
  const all: IssueComment[] = [];
  const client: GitHubClient = {
    listIssueComments: async (pr) => issue.get(pr) ?? [],
    createIssueComment: async (pr, body) => {
      const c = { id: seq++, body };
      issue.set(pr, [...(issue.get(pr) ?? []), c]);
      all.push(c);
      return c;
    },
    updateIssueComment: async (id, body) => {
      const c = all.find((x) => x.id === id)!;
      c.body = body;
      return c;
    },
    listCommitComments: async (sha) => commit.get(sha) ?? [],
    createCommitComment: async (sha, body) => {
      const c = { id: seq++, body };
      commit.set(sha, [...(commit.get(sha) ?? []), c]);
      all.push(c);
      return c;
    },
    updateCommitComment: async (id, body) => {
      const c = all.find((x) => x.id === id)!;
      c.body = body;
      return c;
    },
  };
  return {
    client,
    prCount: (pr: number) => (issue.get(pr) ?? []).length,
    commitCount: (sha: string) => (commit.get(sha) ?? []).length,
  };
}

const prBody = (n: number) => `${markerFor("pr")}\nrun ${n}`;
const pushBody = (n: number) => `${markerFor("push")}\nrun ${n}`;

describe("PR comment idempotency", () => {
  it("creates on first run", async () => {
    const fc = fakeClient();
    const r = await upsertPrComment(fc.client, 42, prBody(1));
    expect(r.action).toBe("created");
    expect(fc.prCount(42)).toBe(1);
  });

  it("updates the same comment in place on rerun (no duplicate)", async () => {
    const fc = fakeClient();
    await upsertPrComment(fc.client, 42, prBody(1));
    const r2 = await upsertPrComment(fc.client, 42, prBody(2));
    expect(r2.action).toBe("updated");
    expect(fc.prCount(42)).toBe(1);
    expect(r2.comment.body).toContain("run 2");
  });

  it("updates in place on synchronize (new head sha, same PR) — not SHA-scoped", async () => {
    const fc = fakeClient();
    await upsertPrComment(fc.client, 42, prBody(1)); // first push
    const r = await upsertPrComment(fc.client, 42, prBody(2)); // synchronize event
    expect(r.action).toBe("updated");
    expect(fc.prCount(42)).toBe(1);
  });
});

describe("push commit comment", () => {
  it("creates one commit comment on the target sha", async () => {
    const fc = fakeClient();
    const r = await upsertPushComment(fc.client, "abc123", pushBody(1));
    expect(r.action).toBe("created");
    expect(fc.commitCount("abc123")).toBe(1);
  });

  it("updates the same commit comment on rerun without duplicating", async () => {
    const fc = fakeClient();
    await upsertPushComment(fc.client, "abc123", pushBody(1));
    const r2 = await upsertPushComment(fc.client, "abc123", pushBody(2));
    expect(r2.action).toBe("updated");
    expect(fc.commitCount("abc123")).toBe(1);
  });
});
