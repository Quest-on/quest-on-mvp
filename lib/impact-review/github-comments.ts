import { markerFor } from "./format";

/**
 * GitHub 코멘트 멱등 upsert.
 * - PR: 안정 PR-level 마커로 같은 코멘트를 update-in-place (SHA-scoped 금지).
 * - push: 대상 커밋의 commit comment를 마커로 update/create.
 * 인터페이스로 추상화해 fake-client 테스트가 가능하다.
 */
export interface IssueComment {
  id: number;
  body: string;
}

export interface GitHubClient {
  listIssueComments(prNumber: number): Promise<IssueComment[]>;
  createIssueComment(prNumber: number, body: string): Promise<IssueComment>;
  updateIssueComment(commentId: number, body: string): Promise<IssueComment>;
  listCommitComments(sha: string): Promise<IssueComment[]>;
  createCommitComment(sha: string, body: string): Promise<IssueComment>;
  updateCommitComment(commentId: number, body: string): Promise<IssueComment>;
}

export type UpsertAction = "created" | "updated";

export async function upsertPrComment(
  client: GitHubClient,
  prNumber: number,
  body: string
): Promise<{ action: UpsertAction; comment: IssueComment }> {
  const marker = markerFor("pr");
  const existing = (await client.listIssueComments(prNumber)).find((c) =>
    c.body.includes(marker)
  );
  if (existing) {
    const comment = await client.updateIssueComment(existing.id, body);
    return { action: "updated", comment };
  }
  const comment = await client.createIssueComment(prNumber, body);
  return { action: "created", comment };
}

export async function upsertPushComment(
  client: GitHubClient,
  sha: string,
  body: string
): Promise<{ action: UpsertAction; comment: IssueComment }> {
  const marker = markerFor("push");
  const existing = (await client.listCommitComments(sha)).find((c) =>
    c.body.includes(marker)
  );
  if (existing) {
    const comment = await client.updateCommitComment(existing.id, body);
    return { action: "updated", comment };
  }
  const comment = await client.createCommitComment(sha, body);
  return { action: "created", comment };
}

// ─── REST 구현 (CI 전용; GITHUB_TOKEN + GITHUB_REPOSITORY 사용) ─────────────────

export function createGitHubClientFromEnv(): GitHubClient | null {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // "owner/name"
  if (!token || !repo) return null;
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const base = `${api}/repos/${repo}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const json = async (res: Response) => {
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<IssueComment[] | IssueComment>;
  };

  return {
    listIssueComments: async (pr) =>
      (await json(
        await fetch(`${base}/issues/${pr}/comments?per_page=100`, { headers })
      )) as IssueComment[],
    createIssueComment: async (pr, body) =>
      (await json(
        await fetch(`${base}/issues/${pr}/comments`, {
          method: "POST",
          headers,
          body: JSON.stringify({ body }),
        })
      )) as IssueComment,
    updateIssueComment: async (id, body) =>
      (await json(
        await fetch(`${base}/issues/comments/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ body }),
        })
      )) as IssueComment,
    listCommitComments: async (sha) =>
      (await json(
        await fetch(`${base}/commits/${sha}/comments?per_page=100`, { headers })
      )) as IssueComment[],
    createCommitComment: async (sha, body) =>
      (await json(
        await fetch(`${base}/commits/${sha}/comments`, {
          method: "POST",
          headers,
          body: JSON.stringify({ body }),
        })
      )) as IssueComment,
    updateCommitComment: async (id, body) =>
      (await json(
        await fetch(`${base}/comments/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ body }),
        })
      )) as IssueComment,
  };
}
