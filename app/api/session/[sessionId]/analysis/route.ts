// 세션의 분석 턴 기록(코드 셀, 로그, 그림 주소) 조회 (이슈 #545).
//
// 학생 응시 화면은 새로고침 뒤 대화 기록에 셀 블록을 다시 붙이려고, 교수 채점 화면은 학생 대화 옆에 셀 블록을
// 읽기 전용으로 보여 주려고 부른다. 본인 세션 학생과 그 시험을 만든 교수만 읽는다.
// 서버 전용 값(컨테이너 id, OpenAI 파일 id, 버킷 경로)은 내려보내지 않는다(`toClientAnalysisTurn`).
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { errorJson, successJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { logError } from "@/lib/logger";
import { assertConsentOrRespond } from "@/lib/consent-route-policy";
import { toClientAnalysisTurn } from "@/lib/analysis-exec/metadata";
import { loadSessionAnalysisRecords, resolveSessionAnalysisAccess } from "@/lib/analysis-exec/session-records";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const path = "/api/session/[sessionId]/analysis";
  try {
    const { sessionId } = await params;
    const invalid = validateUUID(sessionId, "sessionId");
    if (invalid) return invalid;

    const user = await currentUser();
    if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);

    const rl = await checkRateLimitAsync(`session-analysis:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) return errorJson("RATE_LIMITED", "Too many requests", 429);

    // 시험 연속성 경로다. 동의를 마치지 않은 사용자는 자기 진행 중 세션만 읽는다.
    const consent = await assertConsentOrRespond(user.id, `/api/session/${sessionId}/analysis`, "GET", { sessionId });
    if (consent) return consent;

    const supabase = getSupabaseServer();
    const access = await resolveSessionAnalysisAccess(supabase, { sessionId, user });
    if (!access.ok) {
      return access.status === 404
        ? errorJson("NOT_FOUND", "Session not found", 404)
        : errorJson("FORBIDDEN", "Access denied", 403);
    }

    const records = await loadSessionAnalysisRecords(supabase, sessionId);
    return successJson({
      turns: records.map((record) => ({
        createdAt: record.createdAt,
        qIdx: record.qIdx,
        ...toClientAnalysisTurn({ sessionId, messageId: record.messageId, turn: record.turn }),
      })),
    });
  } catch (error) {
    void logError("[session-analysis] failed", error, { path });
    return errorJson("INTERNAL_ERROR", "Failed to load analysis records", 500);
  }
}
