import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { compressData } from "@/lib/compression";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { triggerGradingIfNeeded } from "@/lib/grading-trigger";
import { sanitizeUserInput } from "@/lib/sanitize";
import { stripSensitiveQuestionFields } from "@/lib/sanitize-exam-questions";
import {
  ONBOARDING_EVENTS,
  hasOnboardingEvent,
} from "@/lib/onboarding-events";
import { isDemoPreview } from "@/lib/demo-completion";

/** 5-second grace period for network latency (shared across heartbeat/initExamSession/feedback) */
const GRACE_PERIOD_MS = 5_000;

/** 5-minute threshold: sessions with no heartbeat for this long are considered stale (orphaned) */
const STALE_HEARTBEAT_MS = 5 * 60 * 1000;

/**
 * Check if a session is stale based on last_heartbeat_at.
 * A stale session is one where the heartbeat hasn't been received for STALE_HEARTBEAT_MS.
 * Returns false if lastHeartbeatAt is null (session never had heartbeat — could be legacy).
 */
export function isSessionStale(lastHeartbeatAt: string | null | undefined): boolean {
  if (!lastHeartbeatAt) return false;
  return (Date.now() - new Date(lastHeartbeatAt).getTime()) > STALE_HEARTBEAT_MS;
}

// Lazy Supabase client getter — creates a fresh client per invocation
// to avoid stale connections in serverless environments
function getSupabase() {
  return getSupabaseServer();
}

/**
 * Calculate remaining time in ms for a session timer, including grace period.
 * Returns positive ms remaining, 0 if expired, or null if timer not applicable.
 */
export function getSessionTimeRemainingMs(
  timerStartIso: string | null | undefined,
  durationMinutes: number,
  nowTime = Date.now()
): number | null {
  if (!timerStartIso || durationMinutes === 0) return null;
  const timerStartTime = new Date(timerStartIso).getTime();
  const examDurationMs = durationMinutes * 60_000;
  const sessionEndTime = timerStartTime + examDurationMs + GRACE_PERIOD_MS;
  return Math.max(0, sessionEndTime - nowTime);
}

type GateExamRecord = {
  id: string;
  status?: string | null;
  started_at?: string | null;
  duration: number;
};

type GateSessionRecord = {
  id: string;
  status?: string | null;
  started_at?: string | null;
  attempt_timer_started_at?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  is_active?: boolean | null;
  student_id?: string;
  exam_id?: string;
  preflight_accepted_at?: string | null;
  last_heartbeat_at?: string | null;
  device_fingerprint?: string | null;
};

const EXAM_UNAVAILABLE_STATUSES = new Set(["closed", "archived"]);

export function isExamUnavailable(status?: string | null): boolean {
  return EXAM_UNAVAILABLE_STATUSES.has(status || "");
}

export function isExamStarted(
  examStatus?: string | null,
  startedAt?: string | null,
  nowTime = Date.now()
): boolean {
  if (examStatus !== "running" || !startedAt) {
    return false;
  }

  return new Date(startedAt).getTime() <= nowTime;
}

function getSessionTimerStartIso(session: GateSessionRecord): string | null {
  return (
    session.attempt_timer_started_at ||
    session.started_at ||
    session.created_at ||
    null
  );
}

export function getSessionTimeRemainingSeconds(
  session: GateSessionRecord,
  examDuration: number,
  nowTime = Date.now()
): number | null {
  const timerStartIso = getSessionTimerStartIso(session);
  const remainingMs = getSessionTimeRemainingMs(timerStartIso, examDuration, nowTime);
  if (remainingMs === null) return null;
  return Math.max(0, Math.floor(remainingMs / 1000));
}

export function buildGateStatePayload(
  session: GateSessionRecord,
  exam: GateExamRecord,
  nowTime = Date.now()
) {
  const gateStarted = isExamStarted(exam.status, exam.started_at, nowTime);
  const status =
    session.status || (gateStarted ? "in_progress" : "waiting");
  const sessionStartTime =
    status === "in_progress" ? getSessionTimerStartIso(session) : null;
  const timeRemaining =
    status === "in_progress"
      ? getSessionTimeRemainingSeconds(session, exam.duration, nowTime)
      : null;

  return {
    status,
    gateStarted,
    sessionStartTime,
    timeRemaining,
  };
}

export async function promoteSessionToInProgress(
  session: GateSessionRecord,
  now: string,
  options: {
    preflightAcceptedAt?: string;
    deviceFingerprint?: string | null;
  } = {}
) {
  const updateData: Record<string, string | null | boolean> = {
    status: "in_progress",
    started_at: session.started_at || now,
    attempt_timer_started_at: session.attempt_timer_started_at || now,
    is_active: true,
    last_heartbeat_at: now,
  };

  if (options.preflightAcceptedAt) {
    updateData.preflight_accepted_at = options.preflightAcceptedAt;
  }

  if (options.deviceFingerprint !== undefined) {
    updateData.device_fingerprint =
      options.deviceFingerprint || session.device_fingerprint || null;
  }

  // Compare-and-Set: only update if status hasn't changed (prevents race conditions)
  const { data: updatedSession, error } = await getSupabase()
    .from("sessions")
    .update(updateData)
    .eq("id", session.id)
    .eq("status", session.status || "waiting")
    .select(
      "id, exam_id, student_id, submitted_at, is_active, status, started_at, attempt_timer_started_at, device_fingerprint, created_at, used_clarifications, compressed_session_data, compression_metadata, last_heartbeat_at, preflight_accepted_at"
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  // CAS failed (concurrent request already promoted) — re-read current state
  if (!updatedSession) {
    const sessionSelectFields = "id, exam_id, student_id, submitted_at, is_active, status, started_at, attempt_timer_started_at, device_fingerprint, created_at, used_clarifications, compressed_session_data, compression_metadata, last_heartbeat_at, preflight_accepted_at, final_answer, final_answer_updated_at";

    const { data: currentSession, error: readError } = await getSupabase()
      .from("sessions")
      .select(sessionSelectFields)
      .eq("id", session.id)
      .single();

    if (readError || !currentSession) {
      throw readError || new Error(`Session not found after CAS: ${session.id}`);
    }

    // If already promoted to in_progress by another request, return success
    if (currentSession.status === "in_progress") {
      return currentSession;
    }

    // Still waiting — retry CAS once with fresh status
    if (currentSession.status === "waiting" || currentSession.status === "joined" || currentSession.status === "not_joined") {
      const { data: retrySession, error: retryError } = await getSupabase()
        .from("sessions")
        .update(updateData)
        .eq("id", session.id)
        .eq("status", currentSession.status)
        .select(sessionSelectFields)
        .maybeSingle();

      if (retryError) {
        throw retryError;
      }

      // Retry succeeded
      if (retrySession) {
        return retrySession;
      }
    }

    // Retry also failed or unexpected status — return current state
    return currentSession;
  }

  return updatedSession;
}

export async function createOrGetSession(data: { examId: string; studentId: string }) {
  try {
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);
    }

    // 이 경로도 같은 원자 연산을 거친다 (이슈 #84).
    //
    // `create_or_get_session` 은 API 액션으로 노출돼 있어서, 여기서 직접
    // upsert 하면 학생이 이 액션을 불러 발행·학생 한도를 통째로 우회할 수
    // 있다. 한도는 한 문(門)으로만 지나가야 한다.
    const { data: admission, error: admitError } = await getSupabase().rpc(
      "admit_exam_session",
      {
        p_exam_id: data.examId,
        p_student_id: data.studentId,
        p_status: "joined",
        p_fingerprint: null,
      }
    );

    if (admitError) {
      // fail-open. 한도 계산 장애로 수업이 멈추는 것보다 낫다.
      logError("[createOrGetSession] quota_fail_open", admitError, {
        path: "/api/supa/session-handlers",
        additionalData: { examId: data.examId, reason: "admit_rpc_failed" },
      });
    }

    const verdict = Array.isArray(admission) ? admission[0] : admission;
    if (verdict && verdict.admitted === false) {
      return errorJson(
        verdict.denial_reason === "publish_limit"
          ? "PUBLISH_LIMIT_REACHED"
          : "STUDENT_LIMIT_REACHED",
        verdict.denial_reason === "publish_limit"
          ? "Instructor verification required before more exams can be published"
          : "This exam has reached its student limit",
        403
      );
    }

    const { data: upsertedSession, error: upsertError } = await getSupabase()
      .from("sessions")
      .select()
      .eq("exam_id", data.examId)
      .eq("student_id", data.studentId)
      .maybeSingle();

    if (upsertError) throw upsertError;

    // If ignoreDuplicates skipped the insert, fetch the existing session
    let session = upsertedSession;
    if (!session) {
      const { data: existing, error: fetchError } = await getSupabase()
        .from("sessions")
        .select("id, exam_id, student_id, used_clarifications, created_at, submitted_at, is_active, status, started_at, attempt_timer_started_at, device_fingerprint, last_heartbeat_at, compressed_session_data, compression_metadata")
        .eq("exam_id", data.examId)
        .eq("student_id", data.studentId)
        .single();
      if (fetchError) throw fetchError;
      session = existing;
    }

    // Get existing messages for this session
    const { data: messages, error: messagesError } = await getSupabase()
      .from("messages")
      .select("id, role, content, q_idx, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    // 프론트엔드가 기대하는 형식으로 변환 (qIdx 포함)
    const formattedMessages = (messages || []).map((msg) => ({
      type: msg.role === "user" ? "user" : "assistant",
      message: msg.content,
      timestamp: msg.created_at,
      qIdx: msg.q_idx || 0,
    }));

    return successJson({
      session,
      messages: formattedMessages,
    });
  } catch (error) {
    logError("[createOrGetSession] Failed to create or get session", error, { path: "/api/supa/session-handlers" });
    return errorJson("SESSION_FAILED", "Failed to create or get session", 500);
  }
}

// Optimized function to fetch exam AND session in one go
export async function initExamSession(data: {
  examCode: string;
  studentId: string;
  deviceFingerprint?: string;
  restartDemoAttempt?: boolean;
}) {
  try {
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);
    }

    // 1. Fetch Exam by Code
    const { data: exam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, title, code, description, duration, questions, rubric, rubric_public, chat_weight, status, instructor_id, is_demo, materials, materials_text, created_at, updated_at, open_at, close_at, started_at, allow_draft_in_waiting, allow_chat_in_waiting, student_count, type, deadline")
      .eq("code", data.examCode)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    // 데모 미리보기 (AC-7): 교수자가 자기 데모를 학생 시점으로 겪는 경로다.
    //
    // 온볼딩의 목표가 "가입 직후 자기 과목 데모를 학생 시점으로 끝까지 겪는 것"인데,
    // 이 검사 없이는 교수자가 자기 시험 코드로 들어와도 학생 프로필 게이트에서
    // 403/리다이렉트로 막혀 완주에 도달할 수 없었다.
    //
    // 범위를 is_demo=true + 소유자로 좁힌다. 이걸 일반 시험까지 열으면 교수자가
    // 자기 시험에 세션을 만들어 통계·발행 카운트를 오염시킬 수 있다.
    // 판정은 lib/demo-completion.ts 한 곳에 둔다. 계측 격리(#167)와 이 진입
    // 판정이 같은 정의를 써야 한쪽만 고쳐졌을 때 지표가 갈라지지 않는다.
    const isDemoPreviewAttempt =
      isDemoPreview({
        isDemo: exam.is_demo,
        instructorId: exam.instructor_id,
        userId: user.id,
      }) === true;

    // ✅ Gate 방식: 시험 상태 및 입장 가능 여부 확인
    const now = new Date().toISOString();
    const nowTime = new Date().getTime();
    const examStatus = exam.status || "draft";
    const openAt = exam.open_at ? new Date(exam.open_at).getTime() : null;
    const closeAt = exam.close_at ? new Date(exam.close_at).getTime() : null;
    // ✅ 기본 원칙: 시작 전(draft/joinable/scheduled)에는 Join만 가능, 응시는 불가
    // Running 상태에서만 실제 응시 가능

    // Closed 상태는 Join 불가
    if (isExamUnavailable(examStatus)) {
      return errorJson("EXAM_NOT_AVAILABLE", "Exam not available for joining", 403, { currentStatus: examStatus, message: "This exam is closed or archived" });
    }

    // Determine if this is a non-exam type (assignment, report, code, erd, mindmap)
    const isNonExamType = !!(exam.type && exam.type !== "exam");

    // Gate 필드가 있는 경우: open_at / close_at 체크 (입장 시간)
    // For assignments without close_at, use deadline as entry cutoff
    const effectiveCloseAt = closeAt ?? (isNonExamType && exam.deadline ? new Date(exam.deadline).getTime() : null);
    const hasGateFields = openAt !== null || effectiveCloseAt !== null;
    if (hasGateFields) {
      const isEntryNotYetOpen = openAt !== null && nowTime < openAt;
      if (isEntryNotYetOpen) {
        return errorJson("ENTRY_WINDOW_NOT_OPEN", "Entry window has not opened yet", 403, { openAt: exam.open_at });
      }
      const isEntryClosed = effectiveCloseAt !== null && nowTime >= effectiveCloseAt;
      if (isEntryClosed) {
        return errorJson("ENTRY_WINDOW_CLOSED", "Entry window closed", 403, { closeAt: exam.close_at || exam.deadline, message: "The entry window for this exam has closed" });
      }
    }

    // 응시자에게 내려가는 문항에서 정답키/채점 컨텍스트(correctOptionIndex, ai_context)
    // 와 레거시 core_ability 를 제거한다. 채점은 서버에서 원본 exam 을 다시 읽어 수행하므로
    // 클라이언트에는 이 필드들이 필요 없다. rubric(채점 기준)은 강사가 공개한 경우에만 유지.
    if (exam.questions && Array.isArray(exam.questions)) {
      exam.questions = stripSensitiveQuestionFields(exam.questions, {
        keepRubric: exam.rubric_public === true,
      });
    }

    // 2. Get all existing sessions (most recent first)
    const { data: existingSessions, error: checkError } = await getSupabase()
      .from("sessions")
      .select("id, exam_id, student_id, submitted_at, is_active, status, started_at, attempt_timer_started_at, device_fingerprint, created_at, used_clarifications, compressed_session_data, compression_metadata, last_heartbeat_at")
      .eq("exam_id", exam.id)
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false });

    if (checkError) throw checkError;

    // 일반 학생의 제출본은 계속 읽기 전용으로 돌려준다. 데모 재응시는 CTA가
    // restartDemoAttempt를 명시하고 isDemoPreviewAttempt가 참일 때만 이전
    // 제출·채점·채점 대화·응시 대화를 지운다. UNIQUE (exam_id, student_id) 제약
    // 아래 새 세션을 만들 수 없으므로, 이 확인 없이 자동 초기화하면 새로고침만으로
    // 과거 결과가 사라진다. 완주 마일스톤은 세션 데이터가 아니므로 유지한다.
    const mostRecentSubmittedSession =
      (existingSessions || []).find((s) => !!s.submitted_at) || null;
    let resetDemoSession: (typeof existingSessions)[0] | null = null;

    if (mostRecentSubmittedSession) {
      if (isDemoPreviewAttempt && data.restartDemoAttempt === true) {
        // 초기화를 DB 함수 하나로 맡긴다.
        //
        // 여기서 DELETE 를 여러 번 + UPDATE 로 하면 각각이 독립 커밋이라, 중간에
        // 실패하면 답안은 지워졌는데 세션은 제출 상태로 남는 깨진 상태가
        // 영구화된다 — 다시 풀 수도, 예전 결과를 볼 수도 없게 된다.
        //
        // 함수는 세션 행을 잠그고 데모·소유자 여부를 **다시** 확인한다. 여기서
        // 이미 판정했더라도 그게 유일한 삭제 경로여야 한다.
        const { data: restartedId, error: restartRpcError } = await getSupabase().rpc(
          "restart_demo_attempt",
          { p_exam_id: exam.id, p_user_id: data.studentId }
        );
        if (restartRpcError) throw restartRpcError;

        if (restartedId) {
          const { data: restartedSession, error: reloadError } = await getSupabase()
            .from("sessions")
            .update({ device_fingerprint: data.deviceFingerprint || null })
            .eq("id", restartedId)
            .eq("student_id", data.studentId)
            .select()
            .single();
          if (reloadError) throw reloadError;
          resetDemoSession = restartedSession;
        }
      }

      if (!resetDemoSession) {
        // 제출된 세션이 있으면 재시험 불가 - 제출된 세션만 반환

        // Get messages for submitted session (read-only)
        const { data: sessionMessages } = await getSupabase()
          .from("messages")
          .select("id, role, content, q_idx, created_at")
          .eq("session_id", mostRecentSubmittedSession.id)
          .order("created_at", { ascending: true });

        const messages = (sessionMessages || []).map((msg) => ({
          type: msg.role === "user" ? "user" : "assistant",
          message: msg.content,
          timestamp: msg.created_at,
          qIdx: msg.q_idx || 0,
        }));

        // Fetch submissions for the submitted session
        const { data: submittedSubmissions } = await getSupabase()
          .from("submissions")
          .select("q_idx, answer")
          .eq("session_id", mostRecentSubmittedSession.id);

        return successJson({
          exam,
          session: mostRecentSubmittedSession,
          messages,
          submissions: submittedSubmissions || [],
          isRetakeBlocked: true, // 재시험 차단 플래그
        });
      }
    }

    // 제출되지 않은 세션만 처리
    const unsubmittedSessions = (existingSessions || []).filter(
      (s) => !s.submitted_at
    );

    // Auto-deactivate stale sessions (orphaned from browser crash)
    const staleSessions = unsubmittedSessions.filter(
      (s) => s.is_active && isSessionStale(s.last_heartbeat_at)
    );
    if (staleSessions.length > 0) {
      const staleIds = staleSessions.map((s) => s.id);
      await getSupabase()
        .from("sessions")
        .update({ is_active: false })
        .in("id", staleIds);
      // Update local state to reflect deactivation
      for (const s of staleSessions) {
        s.is_active = false;
      }
    }

    const incomingFingerprint = data.deviceFingerprint || null;

    const exactDeviceMatch =
      incomingFingerprint === null
        ? null
        : unsubmittedSessions.find(
            (s) => s.device_fingerprint === incomingFingerprint
          ) || null;

    // Legacy: device_fingerprint가 비어있는 예전 세션이 있으면, 첫 접속에서 "소유"하도록 할당
    const claimableLegacySession =
      incomingFingerprint === null
        ? null
        : unsubmittedSessions.find((s) => !s.device_fingerprint) || null;

    let existingSession: (typeof existingSessions)[0] | null =
      resetDemoSession || exactDeviceMatch || claimableLegacySession || null;

    let session = existingSession;
    let sessionReactivated = false;
    let messages: Array<{
      type: "user" | "assistant";
      message: string;
      timestamp: string;
      qIdx: number;
    }> = [];

    if (existingSession && !existingSession.submitted_at) {
      // Detect reactivation: session existed but was inactive
      if (!existingSession.is_active) {
        sessionReactivated = true;
      }
      // ✅ Gate 방식: 세션 상태 확인 및 타이머 계산
      const sessionStatus = existingSession.status || "not_joined";

      // ✅ 시험 시간 종료 체크는 in_progress 상태이고 타이머가 시작된 경우에만 수행
      const initTimeRemaining = sessionStatus === "in_progress"
        ? getSessionTimeRemainingMs(existingSession.attempt_timer_started_at, exam.duration, nowTime)
        : null;

      if (initTimeRemaining !== null && initTimeRemaining <= 0) {
        {
        // 기존 답안 가져오기
        const { data: existingSubmissions } = await getSupabase()
          .from("submissions")
          .select("id, q_idx, answer, compressed_answer_data, compression_metadata")
          .eq("session_id", existingSession.id);

        // 자동 제출 처리 (빈 답안이라도 제출) — 이미 제출된 세션은 건너뜀
        const { data: updatedSession, error: updateError } = await getSupabase()
          .from("sessions")
          .update({
            submitted_at: now,
            is_active: false,
            status: "auto_submitted",
            auto_submitted: true,
          })
          .eq("id", existingSession.id)
          .is("submitted_at", null)
          .select()
          .maybeSingle();

        if (updateError) throw updateError;

        // 이미 제출된 세션이면 기존 세션 데이터 사용
        if (!updatedSession) {
          const { data: alreadySubmitted } = await getSupabase()
            .from("sessions")
            .select("*")
            .eq("id", existingSession.id)
            .single();
          session = alreadySubmitted || existingSession;
        } else {
          session = updatedSession;
        }

        // 메시지 로드
        const { data: sessionMessages } = await getSupabase()
          .from("messages")
          .select("id, role, content, q_idx, created_at")
          .eq("session_id", existingSession.id)
          .order("created_at", { ascending: true });

        messages = (sessionMessages || []).map((msg) => ({
          type: msg.role === "user" ? "user" : "assistant",
          message: msg.content,
          timestamp: msg.created_at,
          qIdx: msg.q_idx || 0,
        }));

        return successJson({
          exam,
          session,
          messages,
          submissions: existingSubmissions || [],
          autoSubmitted: true, // 자동 제출 플래그
          timeExpired: true,
        });
      }
      }

      // ✅ 세션 상태에 따라 처리: 기본적으로 시작 전에는 waiting, 시작 후에는 in_progress
      const currentStatus = existingSession.status || "not_joined";
      const examStarted = isExamStarted(examStatus, exam.started_at, nowTime);

      // 이미 InProgress인 경우 (시험이 시작된 경우)
      if (currentStatus === "in_progress") {
        const { data: updatedSession, error: updateError } = await getSupabase()
          .from("sessions")
          .update({
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint:
              incomingFingerprint || existingSession.device_fingerprint || null,
          })
          .eq("id", existingSession.id)
          .eq("status", "in_progress")
          .select()
          .maybeSingle();

        if (updateError) throw updateError;
        // CAS miss: re-read current state
        if (!updatedSession) {
          const { data: reread } = await getSupabase()
            .from("sessions")
            .select("*")
            .eq("id", existingSession.id)
            .single();
          session = reread || existingSession;
        } else {
          session = updatedSession;
        }
      } else if (currentStatus === "late_pending" && !isDemoPreviewAttempt) {
        // 지각 학생: 강사 승인 대기 중 — heartbeat만 업데이트, 상태 전환 없음
        const { data: updatedSession } = await getSupabase()
          .from("sessions")
          .update({ is_active: true, last_heartbeat_at: now })
          .eq("id", existingSession.id)
          .eq("status", "late_pending")
          .select()
          .maybeSingle();
        session = updatedSession || existingSession;
      } else if (
        (isDemoPreviewAttempt || examStarted || isNonExamType) &&
        ["waiting", "joined", "not_joined", "late_pending"].includes(currentStatus)
      ) {
        // 시험이 시작되었거나 비시험 유형이면 바로 in_progress로 전환
        session = await promoteSessionToInProgress(existingSession, now, {
          deviceFingerprint: incomingFingerprint,
        });
      } else {
        // Waiting 상태인 경우 (시험 시작 대기 중)
        const targetStatus =
          currentStatus === "joined" || currentStatus === "not_joined"
            ? "waiting"
            : currentStatus;
        const { data: updatedSession, error: updateError } = await getSupabase()
          .from("sessions")
          .update({
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint:
              incomingFingerprint || existingSession.device_fingerprint || null,
            status: targetStatus,
          })
          .eq("id", existingSession.id)
          .eq("status", currentStatus)
          .select()
          .maybeSingle();

        if (updateError) throw updateError;
        // CAS miss: re-read current state
        if (!updatedSession) {
          const { data: reread } = await getSupabase()
            .from("sessions")
            .select("*")
            .eq("id", existingSession.id)
            .single();
          session = reread || existingSession;
        } else {
          session = updatedSession;
        }
      }

      // Get messages for existing session
      const { data: sessionMessages } = await getSupabase()
        .from("messages")
        .select("id, role, content, q_idx, created_at")
        .eq("session_id", existingSession.id)
        .order("created_at", { ascending: true });

      messages = (sessionMessages || []).map((msg) => ({
        type: msg.role === "user" ? "user" : "assistant",
        message: msg.content,
        timestamp: msg.created_at,
        qIdx: msg.q_idx || 0,
      }));
    } else {
      // 새 데모 소유자 미리보기는 교수자의 시작·지각 승인 절차를 거치지 않는다.
      // isDemoPreviewAttempt는 is_demo와 소유자를 함께 확인했으므로 일반 시험의
      // 지각 입장 승인 구멍으로 넓어지지 않는다.
      const examStarted = isExamStarted(examStatus, exam.started_at, nowTime);
      let initialStatus: string;
      if (isDemoPreviewAttempt || isNonExamType) {
        initialStatus = "in_progress";
      } else if (!examStarted) {
        initialStatus = "waiting"; // 시험 미시작: 무제한/유한 모두 대기
      } else if (exam.duration === 0) {
        initialStatus = "in_progress"; // 무제한 + 시작됨: 지각 개념 없음, 바로 입장
      } else {
        initialStatus = "late_pending"; // 유한 + 시작 후 입장: 강사 승인 필요
      }

      // 입장 판정과 세션 생성을 하나의 원자 연산으로 맡긴다 (이슈 #84).
      //
      // 여기서 "세어보고 → 괜찮으면 → 넣기"를 하면 TOCTOU 다. 수업 시작 순간
      // 30명이 동시에 들어오면 전부 카운트를 읽고 전부 통과해 한도를 넘긴다.
      // 함수가 교수자 단위 advisory lock 으로 직렬화하고, 기존 학생 통과·데모
      // 우회·학생 수 한도·발행 한도·세션 삽입·first_published_at 기록을
      // 한 트랜잭션에서 처리한다.
      const { data: admission, error: admitError } = await getSupabase().rpc(
        "admit_exam_session",
        {
          p_exam_id: exam.id,
          p_student_id: data.studentId,
          p_status: initialStatus,
          p_fingerprint: incomingFingerprint ?? null,
        }
      );

      // 한도 판정이 깨지면 학생을 들여보낸다(fail-open). 한도 계산 장애로
      // 수업이 멈추는 것보다 잠시 한도가 풀리는 쪽이 낫다.
      //
      // 로그만 남기고 넘어가면 fail-open 이 아니다 — RPC 가 세션을 못 만들었으니
      // 아래 조회가 비어 500 이 된다. 그래서 여기서 직접 만들어 준다.
      if (admitError) {
        logError("[initExamSession] quota_fail_open", admitError, {
          path: "/api/supa/session-handlers",
          additionalData: { examId: exam.id, reason: "admit_rpc_failed" },
        });

        const { error: fallbackError } = await getSupabase()
          .from("sessions")
          .upsert(
            {
              exam_id: exam.id,
              student_id: data.studentId,
              used_clarifications: 0,
              is_active: true,
              last_heartbeat_at: now,
              device_fingerprint: incomingFingerprint,
              created_at: now,
              status: initialStatus,
              started_at: initialStatus === "in_progress" ? now : null,
              attempt_timer_started_at: initialStatus === "in_progress" ? now : null,
            },
            { onConflict: "exam_id,student_id", ignoreDuplicates: true }
          );
        if (fallbackError) throw fallbackError;
      }

      const verdict = Array.isArray(admission) ? admission[0] : admission;

      if (verdict && verdict.admitted === false) {
        return errorJson(
          verdict.denial_reason === "publish_limit"
            ? "PUBLISH_LIMIT_REACHED"
            : "STUDENT_LIMIT_REACHED",
          verdict.denial_reason === "publish_limit"
            ? "Instructor verification required before more exams can be published"
            : "This exam has reached its student limit",
          403
        );
      }

      const { data: upsertedSession, error: upsertError } = await getSupabase()
        .from("sessions")
        .select()
        .eq("exam_id", exam.id)
        .eq("student_id", data.studentId)
        .maybeSingle();

      if (upsertError) throw upsertError;

      // RPC 가 세션을 만들었으므로 여기서는 읽기만 한다.
      //
      // first_published_at 기록도 RPC 안에서 세션 삽입과 같은 트랜잭션에 있다.
      // 밖에서 하면 세션은 생겼는데 발행이 안 잡혀 한도가 영영 차지 않는다.
      if (!upsertedSession) {
        return errorJson("INIT_SESSION_FAILED", "Failed to initialize session", 500);
      }
      session = upsertedSession;
    }

    if (!session) {
      return errorJson("INIT_SESSION_FAILED", "Failed to initialize session", 500);
    }

    // Fetch existing submissions for this session
    const { data: sessionSubmissions } = await getSupabase()
      .from("submissions")
      .select("q_idx, answer")
      .eq("session_id", session.id);

    const gateState = buildGateStatePayload(
      session,
      {
        id: exam.id,
        status: examStatus,
        started_at: exam.started_at,
        duration: exam.duration,
      },
      nowTime
    );

    // 고지를 이미 확인한 학생인가 (AC-15). preflight 자체는 시험마다 뜨지만
    // AI 사용 3줄 고지는 사람 단위로 최초 1회다. 조회가 실패하면 false 라
    // 고지를 한 번 더 보여주는 쪽으로 실패한다.
    const disclosureAcknowledged = await hasOnboardingEvent(
      data.studentId,
      ONBOARDING_EVENTS.STUDENT_DISCLOSURE_ACK
    );

    return successJson({
      exam,
      session,
      messages,
      submissions: sessionSubmissions || [],
      sessionStartTime: gateState.sessionStartTime || session.created_at || null,
      timeRemaining: gateState.timeRemaining,
      sessionStatus: gateState.status,
      gateStarted: gateState.gateStarted,
      sessionReactivated, // 세션 복원 여부 (브라우저 닫기 후 재진입 시)
      disclosureAcknowledged,
      // 클라이언트 프로필 게이트가 이걸 보고 데모 소유자를 우회시킨다 (AC-7).
      demoPreview: isDemoPreviewAttempt,
    });
  } catch (error) {
    logError("[initExamSession] Failed to initialize exam session", error, { path: "/api/supa/session-handlers" });
    return errorJson("INIT_SESSION_FAILED", "Failed to initialize exam session", 500);
  }
}

export async function submitExam(data: {
  examId: string;
  studentId: string;
  sessionId: string;
  answers: unknown[];
  chatHistory?: unknown[];
  feedback?: string;
  feedbackResponses?: unknown[];
}) {
  try {
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (data.studentId && user.id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);
    }
    const verifiedStudentId = user.id;

    const { data: sessionCheck, error: sessionCheckError } = await getSupabase()
      .from("sessions")
      .select("id, student_id, exam_id, submitted_at, attempt_timer_started_at, status, exams(duration)")
      .eq("id", data.sessionId)
      .single();

    if (sessionCheckError || !sessionCheck) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (sessionCheck.student_id !== verifiedStudentId) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

    if (sessionCheck.exam_id !== data.examId) {
      return errorJson("BAD_REQUEST", "Session does not belong to this exam", 400);
    }

    if (sessionCheck.submitted_at) {
      return errorJson("ALREADY_SUBMITTED", "This session has already been submitted", 409);
    }

    // Server-side deadline enforcement (uses shared utility)
    const examsRaw = sessionCheck.exams as { duration: number } | { duration: number }[] | null;
    const examDuration = Array.isArray(examsRaw) ? examsRaw[0]?.duration : examsRaw?.duration;

    if (examDuration && examDuration > 0 && sessionCheck.status === "in_progress") {
      const remaining = getSessionTimeRemainingMs(sessionCheck.attempt_timer_started_at, examDuration);
      if (remaining !== null && remaining <= 0) {
        return errorJson("DEADLINE_EXCEEDED", "Exam time has expired", 403);
      }
    }

    // Validate answers array length against exam question count
    const { data: examForValidation, error: examValError } = await getSupabase()
      .from("exams")
      .select("questions")
      .eq("id", data.examId)
      .single();

    if (!examValError && examForValidation?.questions && Array.isArray(examForValidation.questions)) {
      const questionCount = examForValidation.questions.length;
      if (data.answers.length > questionCount) {
        return errorJson("VALIDATION_ERROR", `Too many answers: got ${data.answers.length}, expected at most ${questionCount}`, 400);
      }
    }

    // Reject answers that contain XSS / dangerous HTML content
    for (const answer of data.answers) {
      const answerObj = answer as Record<string, unknown>;
      if (typeof answerObj.text === "string") {
        const sanitized = sanitizeUserInput(answerObj.text);
        if (sanitized !== answerObj.text) {
          return errorJson("INVALID_INPUT", "Answers contain invalid content", 400);
        }
      }
    }

    // Compress the session data
    const sessionData = {
      chatHistory: data.chatHistory || [],
      answers: data.answers,
      feedback: data.feedback,
      feedbackResponses: data.feedbackResponses || [],
    };

    const compressedSessionData = compressData(sessionData);

    // Build per-answer compressed payloads
    const submissionsPayload = data.answers.map(
      (answer: unknown, index: number) => {
        const answerObj = answer as Record<string, unknown>;
        const submissionData = { answer: answerObj.text || answer };
        const compressedSubmissionData = compressData(submissionData);
        return {
          q_idx: index,
          answer: answerObj.text || answer,
          compressed_answer_data: compressedSubmissionData.data,
          compression_metadata: compressedSubmissionData.metadata,
        };
      }
    );

    const submittedAt = new Date().toISOString();

    // Atomic RPC: session update + submission inserts in a single transaction
    const { data: rpcResult, error: rpcError } = await getSupabase().rpc(
      "submit_exam_atomic",
      {
        p_session_id: data.sessionId,
        p_student_id: verifiedStudentId,
        p_exam_id: data.examId,
        p_submitted_at: submittedAt,
        p_compressed_data: compressedSessionData.data,
        p_compression_metadata: compressedSessionData.metadata,
        p_submissions: submissionsPayload,
      }
    );

    if (rpcError) throw rpcError;

    if (rpcResult?.status === "already_submitted") {
      return errorJson("ALREADY_SUBMITTED", "This session has already been submitted", 409);
    }

    // Audit log: session submit (awaited for critical operations)
    const auditOk = await auditLog({
      action: "session_submit",
      userId: verifiedStudentId,
      targetId: data.sessionId,
      details: { examId: data.examId, submissionsCount: submissionsPayload.length },
    });
    if (!auditOk) {
      logError("[submitExam] Audit log failed for session_submit", new Error("auditLog returned false"), {
        path: "/api/supa/session-handlers",
        additionalData: { sessionId: data.sessionId, examId: data.examId },
      });
    }

    await triggerGradingIfNeeded(data.sessionId, "submit_exam");

    return successJson({
      session: { id: data.sessionId, submitted_at: submittedAt, status: "submitted" },
      submissions: submissionsPayload,
      compressionStats: compressedSessionData.metadata,
    });
  } catch (error) {
    logError("[submitExam] Failed to submit exam", error, { path: "/api/supa/session-handlers" });
    return errorJson("SUBMIT_EXAM_FAILED", "Failed to submit exam", 500);
  }
}

export async function sessionHeartbeat(data: {
  sessionId: string;
  studentId: string;
}) {
  try {
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    if (user.id !== data.studentId) return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);

    // Verify the session belongs to the student
    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select("id, student_id, is_active, submitted_at, auto_submitted, created_at, exam_id, status, started_at, attempt_timer_started_at")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 403);
    }

    // ✅ 이미 제출된 경우 (강사 강제 종료 포함)
    if (session.submitted_at) {
      return successJson({
        submitted: true,
        autoSubmitted: !!session.auto_submitted,
        timeExpired: true,
      });
    }

    // ✅ 시험 정보 가져와서 시간 체크
    const { data: exam, error: examError } = await getSupabase()
      .from("exams")
      .select("duration")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      // 시험 정보를 가져오지 못해도 하트비트는 계속 진행
      if (examError) {
        logError("Failed to fetch exam for heartbeat", examError, { path: "/api/supa" });
      }
    } else {
      // ✅ Gate 방식: attempt_timer_started_at 기준으로 시간 체크 (shared utility)
      const sessionStatus = (session.status as string) || "not_joined";
      const timerStartIso = (session.attempt_timer_started_at as string) || (session.started_at as string) || null;

      if (sessionStatus === "in_progress") {
        const heartbeatRemaining = getSessionTimeRemainingMs(timerStartIso, exam.duration);

        if (heartbeatRemaining !== null && heartbeatRemaining <= 0) {
          // ✅ 시간 종료 - 자동 제출 처리 (grace period 포함)
          const { data: autoSubmittedSession, error: updateError } = await getSupabase()
            .from("sessions")
            .update({
              submitted_at: new Date().toISOString(),
              status: "auto_submitted",
              auto_submitted: true,
              is_active: false,
            })
            .eq("id", data.sessionId)
            .is("submitted_at", null)
            .select("id")
            .maybeSingle();

          if (updateError) {
            logError("Failed to auto-submit session", updateError, { path: "/api/supa", additionalData: { sessionId: data.sessionId } });
          }

          if (autoSubmittedSession?.id) {
            // Build compressed_session_data for auto-submitted sessions (same as force-end)
            try {
              const [{ data: hbSubmissions }, { data: hbMessages }] = await Promise.all([
                getSupabase()
                  .from("submissions")
                  .select("q_idx, answer, compressed_answer_data, compression_metadata")
                  .eq("session_id", autoSubmittedSession.id),
                getSupabase()
                  .from("messages")
                  .select("q_idx, role, content, created_at")
                  .eq("session_id", autoSubmittedSession.id)
                  .order("created_at", { ascending: true }),
              ]);

              const sessionData = {
                answers: (hbSubmissions || []).map((s) => typeof s.answer === "string" ? s.answer : ""),
                chatHistory: (hbMessages || []).map((m) => ({
                  type: m.role === "user" ? "student" : "ai",
                  content: m.content,
                  timestamp: m.created_at,
                })),
              };

              const compressedSessionData = compressData(sessionData);
              await getSupabase()
                .from("sessions")
                .update({
                  compressed_session_data: compressedSessionData.data,
                  compression_metadata: compressedSessionData.metadata,
                })
                .eq("id", autoSubmittedSession.id);
            } catch (enrichErr) {
              logError("[sessionHeartbeat] Failed to enrich auto-submitted session with compressed data", enrichErr, {
                path: "/api/supa/session-handlers",
                additionalData: { sessionId: autoSubmittedSession.id },
              });
            }

            await triggerGradingIfNeeded(autoSubmittedSession.id, "heartbeat");
          }

          return successJson({
            timeExpired: true,
            autoSubmitted: !!autoSubmittedSession,
          });
        }
      }
    }

    // Only update heartbeat if session is active and not submitted
    if (session.is_active && !session.submitted_at) {
      // P1-4: CAS guard — prevent heartbeat write if session was submitted
      // between the check at L853 and this write (TOCTOU race)
      const { error: updateError } = await getSupabase()
        .from("sessions")
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq("id", data.sessionId)
        .is("submitted_at", null);

      if (updateError) throw updateError;

      // Gate 방식: 남은 시간 계산 (getSessionTimeRemainingSeconds로 통일)
      const sessionStatus = (session.status as string) || "not_joined";
      const timeRemaining =
        exam && sessionStatus === "in_progress"
          ? getSessionTimeRemainingSeconds(session as GateSessionRecord, exam.duration)
          : null;

      return successJson({
        timeRemaining,
      });
    } else {
      // Session is not active or already submitted
      return errorJson("SESSION_INACTIVE", "Session is not active", 400);
    }
  } catch (error) {
    logError("[sessionHeartbeat] Failed to update heartbeat", error, { path: "/api/supa/session-handlers" });
    return errorJson("HEARTBEAT_FAILED", "Failed to update heartbeat", 500);
  }
}

export async function checkExamGateStatus(data: {
  examId: string;
  sessionId: string;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select(
        "id, exam_id, student_id, status, started_at, attempt_timer_started_at, created_at, preflight_accepted_at, last_heartbeat_at, device_fingerprint"
      )
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

    if (session.exam_id !== data.examId) {
      return errorJson("BAD_REQUEST", "Session does not belong to this exam", 400);
    }

    const { data: exam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, status, started_at, duration")
      .eq("id", data.examId)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    const now = new Date().toISOString();
    const nowTime = Date.now();
    let reconciledSession = session;

    if (
      isExamStarted(exam.status, exam.started_at, nowTime) &&
      ["waiting", "joined", "", null].includes(session.status || null)
    ) {
      reconciledSession = await promoteSessionToInProgress(session, now);
    }

    const gateState = buildGateStatePayload(reconciledSession, exam, nowTime);

    return successJson({
      gateStarted: gateState.gateStarted,
      examStatus: exam.status,
      sessionStatus: gateState.status,
      sessionStartTime: gateState.sessionStartTime,
      timeRemaining: gateState.timeRemaining,
    });
  } catch (error) {
    logError("[checkExamGateStatus] Failed", error, { path: "/api/supa/session-handlers" });
    return errorJson("CHECK_GATE_FAILED", "Failed to check gate status", 500);
  }
}

export async function deactivateSession(data: {
  sessionId: string;
  studentId: string;
}) {
  try {
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    if (user.id !== data.studentId) return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);

    // Verify the session belongs to the student
    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select("id, student_id")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 403);
    }

    // Deactivate the session
    const { error: updateError } = await getSupabase()
      .from("sessions")
      .update({ is_active: false })
      .eq("id", data.sessionId);

    if (updateError) throw updateError;

    return successJson({});
  } catch (error) {
    logError("[deactivateSession] Failed to deactivate session", error, { path: "/api/supa/session-handlers" });
    return errorJson("DEACTIVATE_SESSION_FAILED", "Failed to deactivate session", 500);
  }
}
