import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServer();

    // Authentication check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Rate limit: prevent paste log spam
    const rl = await checkRateLimitAsync(`paste-log:${user.id}`, RATE_LIMITS.pasteLog);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many paste log requests", 429);
    }

    const body = await request.json();
    const {
      length,
      pasted_text,
      paste_start,
      paste_end,
      answer_length_before,
      isInternal,
      ts,
      examCode,
      questionId,
      sessionId,
    } = body;

    if (!sessionId) {
      return errorJson("BAD_REQUEST", "sessionId is required", 400);
    }

    // Verify session ownership
    const { data: session } = await supabase
      .from("sessions")
      .select("id, student_id, status, submitted_at")
      .eq("id", sessionId)
      .single();

    if (!session || session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    // 진행 중인 세션에만 기록한다.
    //
    // 종료된 세션에 붙여넣기 로그를 계속 넣을 수 있으면 시험 연속성 예외가
    // 영구 우회가 되고, 응시 후 증적을 덧쓰는 경로도 열린다.
    if (session.submitted_at || session.status !== "in_progress") {
      return errorJson("SESSION_CLOSED", "Session is no longer active", 409);
    }

    const suspicious = !isInternal;
    const timestamp = new Date(ts);

    const { error: insertError } = await supabase.from("paste_logs").insert({
      session_id: sessionId,
      exam_code: examCode,
      question_id: questionId,
      length: length,
      // Store raw pasted text without mutation so downstream regex/highlight
      // logic can match against the exact original content.
      pasted_text: pasted_text ?? null,
      paste_start: paste_start ?? null,
      paste_end: paste_end ?? null,
      answer_length_before: answer_length_before ?? null,
      is_internal: isInternal,
      suspicious: suspicious,
      timestamp: timestamp.toISOString(),
    });

    if (insertError) {
      logError("[paste-log] Failed to insert paste log — cheating detection data lost", insertError, {
        path: "/api/log/paste",
        additionalData: { sessionId, examCode, questionId },
      });
    }

    return successJson();
  } catch (error) {
    logError("[paste-log] Unhandled error in paste log handler", error, {
      path: "/api/log/paste",
    });
    return errorJson("INTERNAL_ERROR", "Failed to log event", 500);
  }
}
