import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * q_idx 매핑 회귀 가드 (실제 사고: commit e4ae062).
 *
 * 채점 페이지가 submissions/grades/messages를 `currentQuestion.idx`로만 조회하면,
 * 문항 idx ≠ 배열 위치인 시험(출제 중 편집 흔적)에서 답안·채팅·점수가 빈 값으로 빠진다.
 * 저장 계층은 배열 위치(q_idx)로 키잉되므로 `resolveByQIdx([idx, 배열위치] 폴백)`로 조회해야 한다.
 *
 * 이 불변식은 사고를 낸 적 있어 확률적 AI 리뷰가 아니라 *결정적 테스트*로 박는다.
 * (qIdx 규칙을 정규식에서 뺀 뒤 AI 레인이 이 실제 회귀를 못 잡는 걸 라이브로 확인함.)
 */
const PAGE = "app/(app)/instructor/[examId]/grade/[studentId]/page.tsx";

/** 채점 페이지가 submissions(배열 위치)와 grades(question.idx) 이중 q_idx 규약을 분리해 쓰는가. */
export function usesQIdxFallback(src: string): boolean {
  const resolveByQIdxPattern =
    /import\s*\{[^}]*\bresolveByQIdx\b[^}]*\}\s*from\s*["']@\/lib\/grading-helpers["']/.test(src) &&
    /resolveByQIdx\s*\(\s*sessionData\.submissions\b/.test(src) &&
    /resolveByQIdx\s*\(\s*sessionData\.grades\b/.test(src) &&
    /resolveByQIdx\s*\(\s*sessionData\.messages\b/.test(src);

  const splitIdxPattern =
    /const\s+submissionQIdx\s*=\s*selectedQuestionIdx/.test(src) &&
    /sessionData\.submissions\?\.\[submissionQIdx\]/.test(src) &&
    /sessionData\.grades\?\.\[gradeQIdx\]/.test(src) &&
    /sessionData\.messages\?\.\[submissionQIdx\]/.test(src);

  return resolveByQIdxPattern || splitIdxPattern;
}

describe("q_idx grade-mapping regression guard (real incident e4ae062)", () => {
  it("grade page resolves submissions/grades/messages via resolveByQIdx fallback", () => {
    const src = readFileSync(path.join(path.resolve(__dirname, ".."), PAGE), "utf8");
    expect(usesQIdxFallback(src)).toBe(true);
  });

  it("flags the reverted idx-only version (the real bug)", () => {
    // e4ae062 fix를 되돌린 형태 = 진짜 버그. 가드가 이를 false로 잡아야 한다.
    const buggy = [
      'import { isObjectiveQuestion } from "@/lib/grading-helpers";',
      "const currentSubmission = sessionData.submissions?.[selectedQuestionQIdx] as Submission | undefined;",
      "const currentGrade = sessionData.grades?.[selectedQuestionQIdx] as Grade | undefined;",
      "let currentMessages = (sessionData.messages?.[selectedQuestionQIdx] || []) as Conversation[];",
    ].join("\n");
    expect(usesQIdxFallback(buggy)).toBe(false);
  });
});
