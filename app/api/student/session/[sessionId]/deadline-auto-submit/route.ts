import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateUUID } from "@/lib/validate-params";
import { getSupabaseServer } from "@/lib/supabase-server";
import { autoSubmitAssignmentAtDeadline } from "@/lib/assignment-quiz";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const invalidId = validateUUID(sessionId, "sessionId");
  if (invalidId) return invalidId;

  const user = await currentUser();
  if (!user?.id) {
    return errorJson("UNAUTHORIZED", "Unauthorized", 401);
  }

  if (user.role !== "student") {
    return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
  }

  const rl = await checkRateLimitAsync(
    `assignment-deadline-auto-submit:${user.id}`,
    RATE_LIMITS.submission
  );
  if (!rl.allowed) {
    return errorJson("RATE_LIMITED", "Too many requests", 429);
  }

  const { data: session, error: sessionError } = await getSupabaseServer()
    .from("sessions")
    .select("id, student_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
  }

  if (session.student_id !== user.id) {
    return errorJson("FORBIDDEN", "Forbidden", 403);
  }

  const result = await autoSubmitAssignmentAtDeadline(sessionId);
  if (!result.ok) {
    switch (result.error) {
      case "DEADLINE_NOT_PASSED":
        return errorJson("DEADLINE_NOT_PASSED", "Assignment deadline has not passed", 400);
      case "INELIGIBLE_STATUS":
        return errorJson("INELIGIBLE_STATUS", "Session is not eligible for deadline auto-submit", 409);
      case "NOT_ASSIGNMENT":
        return errorJson("NOT_ASSIGNMENT", "This session is not an assignment", 400);
      default:
        return errorJson("AUTO_SUBMIT_FAILED", "Failed to auto-submit assignment", 500);
    }
  }

  return successJson({
    sessionId,
    alreadySubmitted: result.alreadySubmitted ?? false,
  });
}
