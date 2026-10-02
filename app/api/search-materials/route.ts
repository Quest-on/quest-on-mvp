// Node.js Runtime 사용
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import {
  searchMaterialChunks,
  formatSearchResultsAsContext,
} from "@/lib/search-chunks";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { getSupabaseServer } from "@/lib/supabase-server";
import { validateUUID } from "@/lib/validate-params";

/**
 * POST /api/search-materials
 * 질문을 기반으로 관련 수업 자료 검색 (RAG)
 *
 * 교수자가 본인 시험의 자료만 검색한다. 이전에는 로그인만 하면 누구나, examId 를 빼면
 * 모든 교수자의 자료 조각 본문과 파일 주소까지 받을 수 있었다 (#506). 학생 채팅의 RAG 는
 * 이 라우트가 아니라 lib/search-chunks 를 서버에서 직접 부른다.
 */
export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(`search-materials:${user.id}`, RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const body = await request.json();
    const { query, examId, matchThreshold, matchCount } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return errorJson("MISSING_QUERY", "query 필드가 필요합니다 (문자열)", 400);
    }

    // examId 는 필수다. 비우면 전체 시험을 검색하게 되므로 받지 않는다.
    const invalidId = validateUUID(typeof examId === "string" ? examId : undefined, "examId");
    if (invalidId) return invalidId;

    const { data: exam, error: examError } = await getSupabaseServer()
      .from("exams")
      .select("id, instructor_id")
      .eq("id", examId)
      .maybeSingle();

    if (examError) {
      return errorJson("SEARCH_FAILED", "검색 실패", 500, examError.message);
    }
    if (!exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }
    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // 벡터 유사도 검색
    const results = await searchMaterialChunks(query, {
      examId,
      matchThreshold: matchThreshold || 0.5,
      matchCount: matchCount || 5,
    });

    // 컨텍스트 문자열 생성
    const context = formatSearchResultsAsContext(results);

    return successJson({
      results,
      context,
      count: results.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return errorJson("SEARCH_FAILED", "검색 실패", 500, errorMessage);
  }
}
