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

    // Upsert session (race-safe: uses UNIQUE(exam_id, student_id) constraint)
    // Use ignoreDuplicates to avoid overwriting existing session data
    const { data: upsertedSession, error: upsertError } = await getSupabase()
      .from("sessions")
      .upsert(
        {
          exam_id: data.examId,
          student_id: data.studentId,
          used_clarifications: 0,
          created_at: new Date().toISOString(),
        },
        { onConflict: "exam_id,student_id", ignoreDuplicates: true }
      )
      .select()
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
      .select("id, title, code, description, duration, questions, rubric, rubric_public, chat_weight, status, instructor_id, materials, materials_text, created_at, updated_at, open_at, close_at, started_at, allow_draft_in_waiting, allow_chat_in_waiting, student_count, type, deadline")
      .eq("code", data.examCode)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

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

    // ✅ 요구사항: 이미 제출된 세션이 있으면 재시험 불가
    const mostRecentSubmittedSession =
      (existingSessions || []).find((s) => !!s.submitted_at) || null;

    if (mostRecentSubmittedSession) {
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
      exactDeviceMatch || claimableLegacySession || null;

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
      } else if (currentStatus === "late_pending") {
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
        (examStarted || isNonExamType) &&
        ["waiting", "joined", "not_joined"].includes(currentStatus)
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
      // ✅ 새 세션 생성: 기본적으로 시작 전에는 waiting 상태
      // 시험이 이미 시작되었는지 확인 (started_at이 있고 status가 running)
      const examStarted = isExamStarted(examStatus, exam.started_at, nowTime);

      // 시작 전: waiting 상태 (Join만 가능, 응시 불가)
      // 시작 후 + 무제한(과제형): in_progress (바로 응시 가능)
      // 시작 후 + 제한시간 있음: late_pending (강사 승인 필요)
      let initialStatus: string;
      if (isNonExamType) {
        initialStatus = "in_progress";
      } else if (!examStarted) {
        initialStatus = "waiting"; // 시험 미시작: 무제한/유한 모두 대기
      } else if (exam.duration === 0) {
        initialStatus = "in_progress"; // 무제한 + 시작됨: 지각 개념 없음, 바로 입장
      } else {
        initialStatus = "late_pending"; // 유한 + 시작 후 입장: 강사 승인 필요
      }

      // Upsert session (race-safe: uses UNIQUE(exam_id, student_id) constraint)
      // ignoreDuplicates: true prevents overwriting existing session data (timer, status)
      const { data: upsertedSession, error: upsertError } = await getSupabase()
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
        )
        .select()
        .maybeSingle();

      if (upsertError) throw upsertError;

      // ignoreDuplicates skipped the insert — fetch existing session
      if (!upsertedSession) {
        const { data: existing, error: fetchError } = await getSupabase()
          .from("sessions")
          .select("id, exam_id, student_id, submitted_at, is_active, status, started_at, attempt_timer_started_at, device_fingerprint, created_at, used_clarifications, compressed_session_data, compression_metadata, last_heartbeat_at")
          .eq("exam_id", exam.id)
          .eq("student_id", data.studentId)
          .single();
        if (fetchError) throw fetchError;
        session = existing;
      } else {
        session = upsertedSession;
      }
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
