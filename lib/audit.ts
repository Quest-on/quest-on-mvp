import { createClient } from "@supabase/supabase-js";

export type AuditAction =
  | "grade_update"
  | "grade_bulk_commit"
  | "exam_status_change"
  | "exam_delete"
  | "session_submit"
  | "memory_snapshot_failure"
  | "admin_login_success"
  | "admin_login_failure";

interface AuditLogParams {
  action: AuditAction;
  userId: string;
  targetId: string;
  details?: Record<string, unknown>;
}

// Failure monitoring: track consecutive failures
let consecutiveFailures = 0;
const FAILURE_WARN_THRESHOLD = 1;

/**
 * audit_logs 테이블에 감사 로그를 기록합니다.
 * 서버 사이드 전용 (Service Role Key 사용).
 * 연속 실패 시 경고 로그를 출력합니다.
 */
export async function auditLog({
  action,
  userId,
  targetId,
  details,
}: AuditLogParams): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      consecutiveFailures++;
      if (consecutiveFailures >= FAILURE_WARN_THRESHOLD) {
        console.error(
          `[audit] WARNING: ${consecutiveFailures} consecutive audit log failures (missing env vars)`
        );
      }
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { error } = await supabase.from("audit_logs").insert({
      action,
      user_id: userId,
      target_id: targetId,
      details: details ?? null,
    });

    if (error) {
      consecutiveFailures++;
      if (consecutiveFailures >= FAILURE_WARN_THRESHOLD) {
        console.error(
          `[audit] WARNING: ${consecutiveFailures} consecutive audit log failures. Last error: ${error.message}`
        );
      }
      return false;
    }

    // Reset counter on success
    consecutiveFailures = 0;
    return true;
  } catch (err) {
    consecutiveFailures++;
    const errMsg = err instanceof Error ? err.message : "unknown";
    if (consecutiveFailures >= FAILURE_WARN_THRESHOLD) {
      console.error(
        `[audit] WARNING: ${consecutiveFailures} consecutive audit log failures. Last error: ${errMsg}`
      );
    }
    return false;
  }
}
