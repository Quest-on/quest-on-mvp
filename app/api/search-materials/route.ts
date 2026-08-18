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

/**
 * POST /api/search-materials
 * 질문을 기반으로 관련 수업 자료 검색 (RAG)
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

    const body = await request.json();
    const { query, examId, matchThreshold, matchCount } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return errorJson("MISSING_QUERY", "query 필드가 필요합니다 (문자열)", 400);
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
