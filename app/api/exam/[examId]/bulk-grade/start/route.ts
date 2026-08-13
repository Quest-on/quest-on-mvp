export const maxDuration = 60;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { requireBulkGradeAccess } from "@/lib/bulk-grade-access";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  isQStashEnabled,
  enqueueBulkGradeJobs,
  type BulkGradeJobPayload,
} from "@/lib/qstash";
import {
  type BulkGradingScope,
  loadExamMetaOnly,
} from "@/lib/bulk-grading";
import type { ExtractedCriteria } from "@/lib/prompts";
import { isUniqueViolation } from "@/lib/chat-idempotency";
import { extractGradingCriteriaFromChat, isInterviewReady } from "@/lib/bulk-grading-criteria";
import { loadCurrentVersion } from "@/lib/ai-config-store";
import { buildRunProfileSnapshot } from "@/lib/ai-execution-context";
import type { AiTask, ResolvedAiTaskProfile } from "@/lib/ai-task-profile";

/**
 * 런 시작 시 고정하는 태스크 집합 (이슈 #118).
 * 이 런이 실행할 수 있는 모든 채점 태스크를 미리 해석해 스냅샷으로 박는다.
 */
const BULK_RUN_PINNED_TASKS: readonly AiTask[] = [
  "bulk_grading_criteria_extract",
  "bulk_grading_worker",
  "bulk_grading_score_cluster",
];

const BULK_GRADE_START_RATE_LIMIT = { limit: 3, windowSec: 60 };
const STALE_GRADING_MS = 10 * 60 * 1000;
const GRADING_SESSION_SELECT =
  "id, status, updated_at, calibration_status, calibration_sample_session_ids, calibration_sample_grades, calibration_attempt";

function parseScope(body: unknown): BulkGradingScope {
  void body;
  return "full";
}

function parseCriteria(body: unknown): ExtractedCriteria | null {
  const criteriaText =
    body && typeof body === "object" && typeof (body as { criteriaText?: unknown }).criteriaText === "string"
      ? (body as { criteriaText: string }).criteriaText.trim()
      : "";
  const criteriaMode =
    body && typeof body === "object" && (body as { criteriaMode?: unknown }).criteriaMode === "ai_default"
      ? "ai_default"
      : "custom";
  const approvalMode =
    body && typeof body === "object" && (body as { approvalMode?: unknown }).approvalMode === "no_precheck"
      ? "no_precheck"
      : "review_before_commit";
  const approvalHint =
    approvalMode === "no_precheck"
      ? "추가 기준 확인 질문 없이 이 기준으로 바로 전체 CASE 가채점을 진행합니다."
      : "가채점 결과는 강사가 검토한 뒤 확정하기 전까지 최종 점수로 저장하지 않습니다.";

  if (criteriaText) {
    return { criteria_summary: `${criteriaText}\n\n${approvalHint}`, per_question: [] };
  }

  if (criteriaMode === "ai_default") {
    return {
      criteria_summary: `${
        "AI 기본 기준: CASE 답안의 정확성, 논리적 완성도, 근거의 구체성, 문제 요구사항 충족도, 학생-AI 채팅에서 드러난 이해 과정을 종합해 평가합니다."
      }\n\n${approvalHint}`,
      per_question: [],
      score_range: { min: 0, max: 100 },
    };
  }

  return null;
}

async function loadInterviewChatMessages(
  supabase: ReturnType<typeof getSupabaseServer>,
  gradingSessionId: string,
): Promise<Array<{ role: string; content: string }>> {
  const { data } = await supabase
    .from("bulk_grading_messages")
    .select("role, content")
    .eq("session_id", gradingSessionId)
    .order("created_at", { ascending: true });
  return (data ?? []).filter(
    (m): m is { role: string; content: string } =>
      (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const { examId } = await params;
    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    const body = await request.json().catch(() => ({}));
    const scope = parseScope(body);

    const rl = await checkRateLimitAsync(
      `bulk-grade-start:${user?.id ?? "anon"}:${examId}`,
      BULK_GRADE_START_RATE_LIMIT,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const access = await requireBulkGradeAccess(examId, user, {
      requireGradable: true,
    });
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();

    // Check for existing grading session
    const { data: existingSession } = await supabase
      .from("exam_grading_sessions")
      .select(GRADING_SESSION_SELECT)
      .eq("exam_id", examId)
      .eq("instructor_id", access.ctx.user.id)
      .maybeSingle();

    // Load exam meta + submitted sessions
    const [examMeta, sessionsResult] = await Promise.all([
      loadExamMetaOnly(supabase, examId),
      supabase
        .from("sessions")
        .select("id")
        .eq("exam_id", examId)
        .not("submitted_at", "is", null),
    ]);

    if (examMeta.caseQuestions.length === 0) {
      return errorJson("VALIDATION_ERROR", "채점할 문제가 없습니다.", 400);
    }

    if (sessionsResult.error || !sessionsResult.data?.length) {
      return errorJson("VALIDATION_ERROR", "제출한 학생이 없습니다.", 400);
    }

    const studentSessionIds = (sessionsResult.data ?? []).map((s) => s.id as string);
    const targetSessionIds = studentSessionIds;

    if (!isQStashEnabled() && process.env.VERCEL) {
      return errorJson(
        "INTERNAL_ERROR",
        "QStash가 설정되지 않았습니다. 환경 변수를 확인해주세요.",
        500,
      );
    }

    let startSession = existingSession;
    if (!startSession) {
      const insertResult = await supabase
        .from("exam_grading_sessions")
        .insert({
          exam_id: examId,
          instructor_id: access.ctx.user.id,
          status: "draft",
          updated_at: new Date().toISOString(),
        })
        .select(GRADING_SESSION_SELECT)
        .single();

      if (insertResult.error) {
        if (!isUniqueViolation(insertResult.error)) {
          return errorJson("INTERNAL_ERROR", "Failed to initialize grading session", 500);
        }

        const { data: racedSession, error: racedSessionError } = await supabase
          .from("exam_grading_sessions")
          .select(GRADING_SESSION_SELECT)
          .eq("exam_id", examId)
          .eq("instructor_id", access.ctx.user.id)
          .maybeSingle();

        if (racedSessionError || !racedSession) {
          return errorJson("INTERNAL_ERROR", "Failed to initialize grading session", 500);
        }
        startSession = racedSession;
      } else {
        startSession = insertResult.data;
      }
    }

    if (!startSession) {
      return errorJson("INTERNAL_ERROR", "Failed to initialize grading session", 500);
    }

    const hasActiveFullGrading = startSession.status === "grading";
    const hasActiveSampleGrading = startSession.calibration_status === "sample_grading";
    if (startSession.status === "committed" || startSession.status === "committing") {
      return errorJson("CONFLICT", "이미 확정 중이거나 확정된 채점입니다.", 409);
    }
    const activeUpdatedAt = startSession.updated_at
      ? new Date(startSession.updated_at as string).getTime()
      : 0;
    const canReplaceActive =
      (hasActiveFullGrading || hasActiveSampleGrading) &&
      Date.now() - activeUpdatedAt > STALE_GRADING_MS;
    if ((hasActiveFullGrading || hasActiveSampleGrading) && !canReplaceActive) {
      return errorJson("CONFLICT", "채점이 이미 진행 중입니다. 잠시 후 확인해주세요.", 409);
    }

    const gradingSessionId = startSession.id as string;

    // ── AI 설정 핀 (이슈 #118) ──────────────────────────────────────────
    // production 라벨을 **criteria 추출보다 먼저, 한 번만** 읽는다.
    // 기준 추출도 이 런의 일부이므로 같은 버전으로 돌아야 한다. 나중에 읽으면
    // 기준은 A 로 뽑고 학생 채점은 B 로 도는 상태가 만들어진다.
    let pinnedVersionId: string | null = null;
    let pinnedSnapshot: Record<string, unknown> | null = null;
    let criteriaProfile: ResolvedAiTaskProfile | undefined;
    try {
      const version = await loadCurrentVersion();
      pinnedVersionId = version.versionId;
      const snapshot = buildRunProfileSnapshot({
        tasks: BULK_RUN_PINNED_TASKS,
        version,
      });
      pinnedSnapshot = snapshot as unknown as Record<string, unknown>;
      criteriaProfile = snapshot.bulk_grading_criteria_extract;
    } catch (error) {
      logError("bulk-grade start: AI config pin failed", error, {
        path: `/api/exam/${examId}/bulk-grade/start`,
      });
      return errorJson("INTERNAL_ERROR", "AI 설정을 불러오지 못해 채점을 시작할 수 없습니다.", 500);
    }

    const manualCriteria = parseCriteria(body);
    let criteria: ExtractedCriteria;

    if (manualCriteria?.criteria_summary && manualCriteria.criteria_summary.length > 0) {
      // Re-grade path: instructor edited criteria text directly.
      criteria = manualCriteria;
    } else {
      if (!isInterviewReady(startSession.calibration_status as string)) {
        return errorJson(
          "VALIDATION_ERROR",
          "채점 기준 인터뷰를 완료하고 점수 범위(Range)를 확정해주세요.",
          400,
        );
      }

      const chatMessages = await loadInterviewChatMessages(supabase, gradingSessionId);
      const extracted = await extractGradingCriteriaFromChat({
        messages: chatMessages,
        language: examMeta.examLanguage,
        isAssignment: examMeta.isAssignment,
        userId: access.ctx.user.id,
        examId,
        // 기준 추출도 런에 고정된 프로필로 돈다.
        profile: criteriaProfile,
        configVersionId: pinnedVersionId,
      });

      if (!extracted?.score_range) {
        return errorJson(
          "VALIDATION_ERROR",
          "점수 범위(Range)를 확인할 수 없습니다. 인터뷰를 마무리해주세요.",
          400,
        );
      }
      criteria = extracted;
    }


    const attemptId = globalThis.crypto.randomUUID();
    const updatePayload: Record<string, unknown> = {
      grading_criteria: JSON.stringify(criteria),
      grading_total: targetSessionIds.length,
      grading_completed: 0,
      grading_failed_count: 0,
      expected_session_ids: targetSessionIds,
      processed_session_ids: {},
      current_attempt_id: attemptId,
      grading_scope: scope,
      calibration_status: "approved",
      status: "grading",
      updated_at: new Date().toISOString(),
      // 버전과 스냅샷은 항상 함께 쓴다(DB 짝 제약이 이를 강제한다).
      ai_config_version_id: pinnedVersionId,
      ai_profile_snapshot: pinnedSnapshot,
    };

    updatePayload.proposed_grades = {};

    // Update session: criteria + progress tracking. The filters make concurrent
    // start requests converge on a single attempt.
    let updateQuery = supabase
      .from("exam_grading_sessions")
      .update(updatePayload)
      .eq("id", gradingSessionId);

    if (canReplaceActive) {
      updateQuery = updateQuery.lt(
        "updated_at",
        new Date(Date.now() - STALE_GRADING_MS).toISOString(),
      );
    } else {
      updateQuery = updateQuery
        .in("status", ["draft", "grading_done", "grading_failed"])
        .neq("calibration_status", "sample_grading");
    }

    const { data: startedSession, error: updateError } = await updateQuery
      .select("id")
      .maybeSingle();

    if (updateError) {
      logError("bulk-grade start: session update failed", updateError, {
        path: `/api/exam/${examId}/bulk-grade/start`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to start grading session", 500);
    }
    if (!startedSession) {
      return errorJson("CONFLICT", "채점이 이미 진행 중입니다. 잠시 후 확인해주세요.", 409);
    }

    // Dev fallback: no QStash → inline sequential (non-Vercel only)
    if (!isQStashEnabled()) {
      // Dev: run inline (import lazily to avoid bundling in prod)
      await runBulkGradeInline(
        gradingSessionId,
        targetSessionIds,
        examId,
        scope,
        attemptId,
        pinnedVersionId,
      );
      return successJson({ ok: true, total: targetSessionIds.length, mode: "inline", scope });
    }

    // Enqueue QStash jobs
    // 컷오버 sentinel: 이 배포 이후 발행되는 작업은 전부 핀을 요구한다.
    // 워커는 이 플래그로 "배포 전에 큐에 쌓인 레거시 작업" 과 "핀이 깨진 신규 작업" 을
    // 구분한다 — 세션 행의 NULL 만 보고 폴백하면 둘을 구분할 수 없다.
    const jobs: BulkGradeJobPayload[] = targetSessionIds.map((sid) => ({
      gradingSessionId,
      studentSessionId: sid,
      examId,
      scope,
      attemptId,
      pinRequired: true,
      configVersionId: pinnedVersionId ?? undefined,
    }));

    const { published, failed: publishFailed } = await enqueueBulkGradeJobs(jobs);

    // Compensate for publish failures: pre-increment failed counter
    if (publishFailed > 0) {
      await supabase.rpc("merge_bulk_grading_result", {
        p_session_id: gradingSessionId,
        p_student_sid: `__publish_failed_${Date.now()}`,
        p_grades_json: {},
        p_success: false,
        p_scope: scope,
        p_attempt_id: attemptId,
      });
      // For multiple failures, call RPC multiple times
      for (let i = 1; i < publishFailed; i++) {
        await supabase.rpc("merge_bulk_grading_result", {
          p_session_id: gradingSessionId,
          p_student_sid: `__publish_failed_${Date.now()}_${i}`,
          p_grades_json: {},
          p_success: false,
          p_scope: scope,
          p_attempt_id: attemptId,
        });
      }
    }

    return successJson({ ok: true, total: targetSessionIds.length, published, scope });
  } catch (error) {
    logError("bulk-grade start POST handler error", error, {
      path: "/api/exam/bulk-grade/start",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}

async function runBulkGradeInline(
  gradingSessionId: string,
  studentSessionIds: string[],
  examId: string,
  scope: BulkGradingScope,
  attemptId: string,
  configVersionId: string,
): Promise<void> {
  // Dev-only: simulate worker calls sequentially
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  for (const sid of studentSessionIds) {
    try {
      await fetch(`${baseUrl}/api/internal/bulk-grade-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 인라인 경로도 큐 경로와 같은 sentinel 을 실어야 한다. 빠뜨리면 워커가
        // 레거시 분기로 떨어져 핀을 무시하고, 개발 환경만 다른 코드 경로를 타게 된다.
        body: JSON.stringify({
          gradingSessionId,
          studentSessionId: sid,
          examId,
          scope,
          attemptId,
          pinRequired: true,
          configVersionId,
        }),
      });
    } catch (err) {
      logError("bulk-grade inline: worker call failed", err, {
        path: "bulk-grade/start inline",
        additionalData: { sid },
      });
    }
  }
}
