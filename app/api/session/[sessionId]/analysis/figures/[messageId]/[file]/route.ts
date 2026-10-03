// 분석 턴 그림 열기 (이슈 #545).
//
// 그림은 비공개 버킷 `analysis-outputs` 에 있다. 이 라우트가 권한(본인 세션 학생, 또는 그 시험을 만든 교수)을
// 확인하고, 요청한 그림이 그 메시지의 분석 기록에 실제로 있는지 본 뒤 60초짜리 서명 URL 로 보낸다(302).
// 다른 학생, 다른 교수, 기록에 없는 경로는 막는다.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { logError } from "@/lib/logger";
import { assertConsentOrRespond } from "@/lib/consent-route-policy";
import {
  FIGURE_FILE_NAME_RE,
  figureStoragePath,
  isFigureListed,
  readStoredAnalysisTurn,
} from "@/lib/analysis-exec/metadata";
import { resolveSessionAnalysisAccess, signFigureUrl } from "@/lib/analysis-exec/session-records";

/** 서명 URL 수명. 그림을 여는 데만 쓰므로 짧게 둔다. */
const SIGNED_URL_TTL_SEC = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; messageId: string; file: string }> }
) {
  const path = "/api/session/[sessionId]/analysis/figures/[messageId]/[file]";
  try {
    const { sessionId, messageId, file } = await params;
    const invalidSession = validateUUID(sessionId, "sessionId");
    if (invalidSession) return invalidSession;
    const invalidMessage = validateUUID(messageId, "messageId");
    if (invalidMessage) return invalidMessage;
    if (!FIGURE_FILE_NAME_RE.test(file)) return errorJson("INVALID_PARAM", "Invalid figure name", 400);

    const user = await currentUser();
    if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);

    const rl = await checkRateLimitAsync(`analysis-figure:${user.id}`, RATE_LIMITS.analysisFigure);
    if (!rl.allowed) return errorJson("RATE_LIMITED", "Too many requests", 429);

    const consent = await assertConsentOrRespond(
      user.id,
      `/api/session/${sessionId}/analysis/figures/${messageId}/${file}`,
      "GET",
      { sessionId }
    );
    if (consent) return consent;

    const supabase = getSupabaseServer();
    const access = await resolveSessionAnalysisAccess(supabase, { sessionId, user });
    if (!access.ok) {
      return access.status === 404
        ? errorJson("NOT_FOUND", "Figure not found", 404)
        : errorJson("FORBIDDEN", "Access denied", 403);
    }

    // 그림이 이 세션의 이 메시지 기록에 있어야 한다. 경로를 지어내 다른 세션의 그림을 여는 것을 막는다.
    const { data: message, error } = await supabase
      .from("messages")
      .select("id, session_id, role, metadata")
      .eq("id", messageId)
      .eq("session_id", sessionId)
      .eq("role", "ai")
      .maybeSingle();
    if (error || !message) return errorJson("NOT_FOUND", "Figure not found", 404);
    const turn = readStoredAnalysisTurn((message as { metadata?: unknown }).metadata);
    const objectPath = figureStoragePath(sessionId, messageId, file);
    if (!turn || !isFigureListed(turn, objectPath)) return errorJson("NOT_FOUND", "Figure not found", 404);

    const signed = await signFigureUrl(supabase, objectPath, SIGNED_URL_TTL_SEC);
    if (!signed) {
      void logError("[analysis-figure] signed url failed", null, { path, additionalData: { objectPath } });
      return errorJson("NOT_FOUND", "Figure not available", 404);
    }

    const response = NextResponse.redirect(signed, 302);
    // 서명 URL 보다 짧게 캐시한다. 같은 화면에서 다시 그릴 때 요청을 줄인다. 공유 캐시에는 두지 않는다.
    response.headers.set("Cache-Control", "private, max-age=45");
    return response;
  } catch (error) {
    void logError("[analysis-figure] failed", error, { path });
    return errorJson("INTERNAL_ERROR", "Failed to open figure", 500);
  }
}
