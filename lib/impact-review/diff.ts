import { execFileSync } from "node:child_process";
import type { DiffFile, DiffHunk } from "./types";

const ZERO_SHA = "0000000000000000000000000000000000000000";

/** unified diff 텍스트를 DiffFile[]로 파싱한다. context 라인은 무시한다. */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  if (!text || !text.trim()) return files;

  const lines = text.split("\n");
  let current: DiffFile | null = null;
  let hunk: DiffHunk | null = null;

  const pushHunk = () => {
    if (current && hunk) {
      hunk.changedText = `${hunk.addedText}\n${hunk.removedText}`.trim();
      current.hunks.push(hunk);
    }
    hunk = null;
  };
  const pushFile = () => {
    pushHunk();
    if (current) {
      current.changedText = current.hunks.map((h) => h.changedText).join("\n");
      files.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      pushFile();
      const m = line.match(/ b\/(.+)$/);
      const path = m ? m[1] : line.replace(/^diff --git a\/\S+ b\//, "");
      current = { path, status: "modified", hunks: [], changedText: "" };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("new file mode")) current.status = "added";
    else if (line.startsWith("deleted file mode")) current.status = "deleted";
    else if (line.startsWith("rename from") || line.startsWith("rename to"))
      current.status = "renamed";
    else if (line.startsWith("+++ ")) {
      const m = line.match(/^\+\+\+ b\/(.+)$/);
      if (m && m[1] !== "/dev/null") current.path = m[1];
    } else if (line.startsWith("@@")) {
      pushHunk();
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      hunk = {
        changedText: "",
        addedText: "",
        removedText: "",
        oldStart: m ? Number(m[1]) : 0,
        newStart: m ? Number(m[2]) : 0,
      };
    } else if (hunk && line.startsWith("+") && !line.startsWith("+++")) {
      hunk.addedText += line.slice(1) + "\n";
    } else if (hunk && line.startsWith("-") && !line.startsWith("---")) {
      hunk.removedText += line.slice(1) + "\n";
    }
  }
  pushFile();

  // 텍스트 파일만 (바이너리/생성물/.env/.next/coverage 제외).
  return files.filter((f) => isReviewableFile(f.path));
}

export function isReviewableFile(path: string): boolean {
  if (/(^|\/)(\.next|coverage|node_modules|dist|build)\//.test(path)) return false;
  if (/(^|\/)\.env(\.|$)/.test(path)) return false;
  return /\.(ts|tsx|js|jsx|mjs|cjs|md|ya?ml)$/.test(path);
}

export interface RangeResolution {
  range: string | null;
  diffText: string;
  note?: string;
}

/**
 * git 범위에서 diff 텍스트를 얻는다. all-zero before SHA / 빈 diff 안전 처리.
 * (러너 환경 전용 — 테스트는 parseUnifiedDiff에 fixture를 직접 넣는다.)
 */
export function getDiffForRange(rawRange: string | null): RangeResolution {
  let range = rawRange;
  if (range && range.includes(ZERO_SHA)) {
    // 초기 커밋 등: HEAD^..HEAD 로 폴백, 없으면 빈 diff.
    if (hasRev("HEAD^")) range = "HEAD^...HEAD";
    else return { range: null, diffText: "", note: "initial commit; empty range" };
  }
  if (!range) {
    range = hasRev("origin/main") ? "origin/main...HEAD" : hasRev("HEAD^") ? "HEAD^...HEAD" : null;
  }
  if (!range) return { range: null, diffText: "", note: "no resolvable range" };

  try {
    const out = execFileSync(
      "git",
      ["diff", "--unified=0", "--no-ext-diff", "--diff-filter=ACMR", range, "--", "."],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    return { range, diffText: out };
  } catch (err) {
    return { range, diffText: "", note: `git diff failed: ${(err as Error).message}` };
  }
}

function hasRev(rev: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", rev], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
