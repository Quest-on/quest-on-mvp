export const maxDuration = 60;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { requireBulkGradeAccess } from "@/lib/bulk-grade-access";
import { bulkGradeChatPostSchema, validateRequest } from "@/lib/validations";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import {
  CALIBRATION_SAMPLE_SIZE,
  loadCalibrationSampleData,
  loadExamMetaOnly,
  selectCalibrationSampleSessionIds,
} from "@/lib/bulk-grading";
import {
  assistantMessageIdFromClientMessageId,
  isUniqueViolation,
  uuidFromSeed,
} from "@/lib/chat-idempotency";
import { buildCriteriaDiscussionSystemPrompt } from "@/lib/prompts";
import {
  isInterviewReady,
  parseCriteriaReadyMarker,
  stripCriteriaReadyMarker,
  buildInterviewChatMeta,
} from "@/lib/bulk-grading-criteria";
import {
  countInterviewQuestions,
  MIN_BULK_GRADE_INTERVIEW_QUESTIONS,
} from "@/lib/bulk-grade-thread";
import { stripEmoji } from "@/lib/sanitize";
import { getSupabaseServer } from "@/lib/supabase-server";

const BULK_GRADE_CHAT_RATE_LIMIT = { limit: 10, windowSec: 60 };
const BULK_GRADING_SESSION_SELECT =
  "id, status, calibration_status, calibration_sample_session_ids";
const IDEMPOTENT_RESPONSE_WAIT_MS = 250;
const IDEMPOTENT_RESPONSE_ATTEMPTS = 200;

type BulkGradingMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type BulkGradingSessionRow = {
  id: string;
  status: string;
  calibration_status: string;
  calibration_sample_session_ids?: unknown;
};

function initAssistantMessageId(gradingSessionId: string): string {
  return uuidFromSeed(`bulk-grade-chat:init-assistant:${gradingSessionId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canStartFromMessages(
  session: Pick<BulkGradingSessionRow, "status" | "calibration_status"> | null,
): boolean {
  if (!session) return false;
  if (
    session.status === "grading" ||
    session.status === "committing" ||
    session.status === "committed"
  ) {
    return false;
  }
  return isInterviewReady(session.calibration_status);
}

function chatResponseMeta(
  messages: BulkGradingMessageRow[],
  calibrationStatus: string,
) {
  return buildInterviewChatMeta(messages, calibrationStatus);
}

function buildDiscussionOnlyPhaseInstructions(
  session: Pick<BulkGradingSessionRow, "status" | "calibration_status">,
  language: "ko" | "en",
): string {
  if (language === "en") {
    return `
**Bulk grading discussion contract — highest priority:**
- This chat is always discussion-only. Never claim that you directly changed a score, grading status, proposed grade, final grade, progress counter, or commit state.
- If the instructor wants score changes, direct them to use the result table controls, rerun grading, or commit controls shown in the UI.
- Do not use emoji.
- Keep replies compact: 1-3 short sentences, and ask only one interview question when collecting criteria.
- During interviewing: you lead the interview using sample data; the instructor responds. Do NOT ask them to paste criteria first.
- When calibration_status=sample_review: criteria and score range are confirmed — the instructor can start bulk grading from the UI.
- Keep the response aligned with the current phase:
  - draft/interviewing: discuss grading criteria and expectations before bulk grading starts.
  - grading/sample_grading/committing: explain what is happening and what can be reviewed while processing continues.
  - grading_done: help interpret and review proposed grades before commit.
  - committed: help explain final results and review history; do not suggest changing committed state through chat.

Current phase: status=${session.status}, calibration_status=${session.calibration_status}.
`.trim();
  }

  return `
**일괄 가채점 대화 계약 — 최우선 규칙:**
- 이 채팅은 항상 토론 전용입니다. 점수, 채점 상태, 가채점 결과, 최종 점수, 진행률, 확정 상태를 직접 변경했다고 말하지 마세요.
- 강사가 점수 변경을 원하면 화면의 결과 표 입력, 재가채점, 확정 버튼을 사용해야 한다고 안내하세요.
- 이모지를 사용하지 마세요.
- 답변은 1~3개의 짧은 문장으로 유지하고, 기준 수집 단계에서는 인터뷰 질문 1개만 하세요.
- interviewing 단계: 샘플 데이터를 바탕으로 당신이 먼저 인터뷰합니다. 강사에게 기준을 먼저 입력하라고 요구하지 마세요.
- interviewing 단계: 강사 답이 ${MIN_BULK_GRADE_INTERVIEW_QUESTIONS}번 미만이면 [CRITERIA_READY] 마커를 출력하지 마세요. 강사는 UI에서 "여기까지만 질문받고 일단 채점 진행"으로 건너뛸 수 있습니다.
- calibration_status=sample_review: 기준과 점수 범위(min/max)가 확정됨 — 강사가 UI에서 가채점을 시작할 수 있습니다.
- 현재 단계에 맞춰 답하세요:
  - draft/interviewing: 가채점 시작 전 채점 기준과 기대 수준을 논의합니다.
  - grading/sample_grading/committing: 처리 중인 상태를 설명하고, 진행 중 검토 가능한 내용을 안내합니다.
  - grading_done: 확정 전 가채점 결과의 해석과 검토를 돕습니다.
  - committed: 확정된 결과와 히스토리 해석을 돕고, 채팅으로 확정 상태를 바꿀 수 있다고 제안하지 않습니다.

현재 단계: status=${session.status}, calibration_status=${session.calibration_status}.
`.trim();
}

async function loadBulkChatMessages(
  supabase: ReturnType<typeof getSupabaseServer>,
  gradingSessionId: string,
): Promise<{ messages: BulkGradingMessageRow[]; error: unknown }> {
  const { data, error } = await supabase
    .from("bulk_grading_messages")
    .select("id, role, content, created_at")
    .eq("session_id", gradingSessionId)
    .order("created_at", { ascending: true });

  return {
    messages: ((data ?? []) as BulkGradingMessageRow[]).filter(
      (m) => m.role === "user" || m.role === "assistant",
    ),
    error,
  };
}

async function loadBulkGradingSession(
  supabase: ReturnType<typeof getSupabaseServer>,
  examId: string,
  instructorId: string,
): Promise<{ session: BulkGradingSessionRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("exam_grading_sessions")
    .select(BULK_GRADING_SESSION_SELECT)
    .eq("exam_id", examId)
    .eq("instructor_id", instructorId)
    .maybeSingle();

  return {
    session: data ? (data as BulkGradingSessionRow) : null,
    error,
  };
}

async function waitForBulkAssistantMessage(
  supabase: ReturnType<typeof getSupabaseServer>,
  gradingSessionId: string,
  clientMessageId: string,
): Promise<BulkGradingMessageRow | null> {
  for (let attempt = 0; attempt < IDEMPOTENT_RESPONSE_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase
      .from("bulk_grading_messages")
      .select("id, role, content, created_at")
      .eq("session_id", gradingSessionId)
      .eq("role", "assistant")
      .eq("client_message_id", clientMessageId)
      .maybeSingle();

    if (!error && data) return data as BulkGradingMessageRow;
    await sleep(IDEMPOTENT_RESPONSE_WAIT_MS);
  }

  return null;
}

async function insertOrLoadBulkGradingSession(
  supabase: ReturnType<typeof getSupabaseServer>,
  examId: string,
  instructorId: string,
  sampleSessionIds: string[],
): Promise<{ session: BulkGradingSessionRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("exam_grading_sessions")
    .insert({
      exam_id: examId,
      instructor_id: instructorId,
      status: "draft",
      calibration_status: "interviewing",
      calibration_sample_session_ids: sampleSessionIds,
      updated_at: new Date().toISOString(),
    })
    .select(BULK_GRADING_SESSION_SELECT)
    .single();

  if (!error && data) {
    return { session: data as BulkGradingSessionRow, error: null };
  }
  if (!isUniqueViolation(error)) {
    return { session: null, error };
  }
  return loadBulkGradingSession(supabase, examId, instructorId);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const { examId } = await params;
    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();

    const rl = await checkRateLimitAsync(
      `bulk-grade-chat-load:${user?.id ?? "anon"}:${examId}`,
      RATE_LIMITS.sessionRead,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const access = await requireBulkGradeAccess(examId, user, {
      requireGradable: true,
    });
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();
    const { session, error: sessionError } = await loadBulkGradingSession(
      supabase,
      examId,
      access.ctx.user.id,
    );

    if (sessionError) {
      logError("bulk-grade chat GET: grading session query failed", sessionError, {
        path: `/api/exam/${examId}/bulk-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to load grading session", 500);
    }

    if (!session) {
      return successJson({
        session: null,
        messages: [] as BulkGradingMessageRow[],
        canStartGrading: false,
        canProceedToGrading: false,
        interviewQuestionCount: 0,
      });
    }

    const { messages, error: messagesError } = await loadBulkChatMessages(
      supabase,
      session.id,
    );
    if (messagesError) {
      logError("bulk-grade chat GET: messages query failed", messagesError, {
        path: `/api/exam/${examId}/bulk-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to load messages", 500);
    }

    return successJson({
      session: {
        id: session.id,
        status: session.status,
        calibration_status: session.calibration_status,
      },
      messages,
      ...chatResponseMeta(messages, session.calibration_status),
    });
  } catch (error) {
    logError("bulk-grade chat GET handler error", error, {
      path: "/api/exam/bulk-grade/chat",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
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
    const rl = await checkRateLimitAsync(
      `bulk-grade-chat:${user?.id ?? "anon"}:${examId}`,
      BULK_GRADE_CHAT_RATE_LIMIT,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const access = await requireBulkGradeAccess(examId, user, {
      requireGradable: true,
    });
    if (!access.ok) return access.response;

    const body = await request.json();
    const validation = validateRequest(bulkGradeChatPostSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const isInit = "init" in validation.data && validation.data.init === true;
    const isCompleteInterview =
      "completeInterview" in validation.data &&
      validation.data.completeInterview === true;
    const message = isInit || isCompleteInterview
      ? ""
      : (validation.data as { message: string }).message;
    const clientMessageId =
      !isInit && !isCompleteInterview && "clientMessageId" in validation.data
        ? validation.data.clientMessageId
        : undefined;
    const completeScoreMin =
      isCompleteInterview && "scoreMin" in validation.data
        ? validation.data.scoreMin
        : undefined;
    const completeScoreMax =
      isCompleteInterview && "scoreMax" in validation.data
        ? validation.data.scoreMax
        : undefined;

    const supabase = getSupabaseServer();

    // Load exam meta (no student data — fast)
    let examMeta;
    try {
      examMeta = await loadExamMetaOnly(supabase, examId);
    } catch {
      return errorJson("INTERNAL_ERROR", "Failed to load exam data", 500);
    }

    if (examMeta.caseQuestions.length === 0) {
      return errorJson("VALIDATION_ERROR", "채점할 문제가 없습니다.", 400);
    }

    const { data: submittedSessions, error: submittedError } = await supabase
      .from("sessions")
      .select("id")
      .eq("exam_id", examId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: true });

    if (submittedError || !submittedSessions?.length) {
      return errorJson("VALIDATION_ERROR", "제출한 학생이 없습니다.", 400);
    }

    const submittedIds = submittedSessions.map((s) => s.id as string);
    const { session: currentSession, error: currentSessionError } =
      await loadBulkGradingSession(supabase, examId, access.ctx.user.id);

    if (currentSessionError) {
      logError("bulk-grade chat: grading session query failed", currentSessionError, {
        path: `/api/exam/${examId}/bulk-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to load grading session", 500);
    }

    const sampleSessionIds = selectCalibrationSampleSessionIds(
      submittedIds,
      currentSession?.calibration_sample_session_ids,
      CALIBRATION_SAMPLE_SIZE,
    );

    let gradingSession = currentSession;
    if (!gradingSession) {
      const { session: insertedSession, error: insertError } =
        await insertOrLoadBulkGradingSession(
          supabase,
          examId,
          access.ctx.user.id,
          sampleSessionIds,
        );

      if (insertError || !insertedSession) {
        return errorJson("INTERNAL_ERROR", "Failed to initialize grading session", 500);
      }
      gradingSession = insertedSession;
    }

    const gradingSessionId = gradingSession.id as string;

    if (isCompleteInterview) {
      if (canStartFromMessages(gradingSession)) {
        const { messages: existingMessages, error: existingMessagesError } =
          await loadBulkChatMessages(supabase, gradingSessionId);
        if (existingMessagesError) {
          return errorJson("INTERNAL_ERROR", "Failed to load messages", 500);
        }
        return successJson({
          session: {
            id: gradingSession.id,
            status: gradingSession.status,
            calibration_status: gradingSession.calibration_status,
          },
          messages: existingMessages,
          ...chatResponseMeta(existingMessages, gradingSession.calibration_status),
        });
      }

      const { messages: priorMessages, error: priorMessagesError } =
        await loadBulkChatMessages(supabase, gradingSessionId);
      if (priorMessagesError) {
        return errorJson("INTERNAL_ERROR", "Failed to load messages", 500);
      }

      const interviewQuestionCount = countInterviewQuestions(priorMessages);
      if (interviewQuestionCount < MIN_BULK_GRADE_INTERVIEW_QUESTIONS) {
        return errorJson(
          "VALIDATION_ERROR",
          `인터뷰 질문이 ${MIN_BULK_GRADE_INTERVIEW_QUESTIONS}개 이상 필요합니다.`,
          400,
        );
      }

      let scoreMin = completeScoreMin;
      let scoreMax = completeScoreMax;
      if (scoreMin == null || scoreMax == null) {
        for (const msg of [...priorMessages].reverse()) {
          const parsed = parseCriteriaReadyMarker(msg.content);
          if (parsed) {
            scoreMin = scoreMin ?? parsed.min;
            scoreMax = scoreMax ?? parsed.max;
            break;
          }
        }
      }
      if (scoreMin == null) scoreMin = 0;
      if (scoreMax == null) scoreMax = 100;
      if (scoreMin > scoreMax) {
        return errorJson("VALIDATION_ERROR", "최저점은 최고점보다 클 수 없습니다.", 400);
      }

      const completeNote =
        examMeta.examLanguage === "en"
          ? `Understood. We will grade using the criteria discussed so far (score range ${scoreMin}–${scoreMax}). You can start bulk grading from the UI.`
          : `알겠습니다. 지금까지 말씀해 주신 기준으로 가채점을 진행할 수 있습니다 (점수 범위 ${scoreMin}~${scoreMax}점). 전송하면 가채점을 시작하세요.`;

      const completePayload: Record<string, unknown> = {
        session_id: gradingSessionId,
        role: "assistant",
        content: completeNote,
        created_by: access.ctx.user.id,
        id: uuidFromSeed(`bulk-grade-chat:complete-interview:${gradingSessionId}`),
      };

      await supabase.from("bulk_grading_messages").upsert(completePayload, {
        onConflict: "id",
        ignoreDuplicates: true,
      });

      await supabase
        .from("exam_grading_sessions")
        .update({
          calibration_status: "sample_review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", gradingSessionId);

      gradingSession = {
        ...gradingSession,
        calibration_status: "sample_review",
      };

      const { messages: finalMessages, error: finalMessagesError } =
        await loadBulkChatMessages(supabase, gradingSessionId);
      if (finalMessagesError) {
        return errorJson("INTERNAL_ERROR", "Failed to load messages", 500);
      }

      return successJson({
        session: {
          id: gradingSession.id,
          status: gradingSession.status,
          calibration_status: gradingSession.calibration_status,
        },
        messages: finalMessages,
        ...chatResponseMeta(finalMessages, gradingSession.calibration_status),
      });
    }

    // init mode is idempotent: if the thread already exists, return it without
    // touching grading state or calling AI again.
    if (isInit) {
      const { messages: existingMessages, error: existingMessagesError } =
        await loadBulkChatMessages(supabase, gradingSessionId);
      if (existingMessagesError) {
        return errorJson("INTERNAL_ERROR", "Failed to load messages", 500);
      }
      if (existingMessages.some((m) => m.role === "assistant")) {
        return successJson({
          session: {
            id: gradingSession.id,
            status: gradingSession.status,
            calibration_status: gradingSession.calibration_status,
          },
          messages: existingMessages,
          ...chatResponseMeta(existingMessages, gradingSession.calibration_status),
        });
      }
    }

    // init/completeInterview 모드가 아닐 때만 강사 메시지 저장
    if (!isInit && !isCompleteInterview) {
      const userMessagePayload: Record<string, unknown> = {
        session_id: gradingSessionId,
        role: "user",
        content: message,
        created_by: access.ctx.user.id,
        client_message_id: clientMessageId,
      };

      const { error: userMsgError } = await supabase
        .from("bulk_grading_messages")
        .insert(userMessagePayload);

      if (userMsgError) {
        if (isUniqueViolation(userMsgError)) {
          const existingAssistant = await waitForBulkAssistantMessage(
            supabase,
            gradingSessionId,
            clientMessageId!,
          );

          if (existingAssistant) {
            const { messages: existingMessages, error: existingMessagesError } =
              await loadBulkChatMessages(supabase, gradingSessionId);
            if (existingMessagesError) {
              return errorJson("INTERNAL_ERROR", "Failed to load messages", 500);
            }
            return successJson({
              session: {
                id: gradingSession.id,
                status: gradingSession.status,
                calibration_status: gradingSession.calibration_status,
              },
              assistantMessage: existingAssistant,
              messages: existingMessages,
              ...chatResponseMeta(existingMessages, gradingSession.calibration_status),
            });
          }
          return errorJson("CONFLICT", "Message is already being processed", 409);
        } else {
          return errorJson("INTERNAL_ERROR", "Failed to save message", 500);
        }
      }
    }

    // Load chat history
    const { data: historyRows, error: historyError } = await supabase
      .from("bulk_grading_messages")
      .select("role, content")
      .eq("session_id", gradingSessionId)
      .order("created_at", { ascending: true });

    if (historyError) {
      return errorJson("INTERNAL_ERROR", "Failed to load message history", 500);
    }

    const caseQIdxes = examMeta.caseQuestions.map((q) => q.qIdx);
    const sampleStudents = await loadCalibrationSampleData(
      supabase,
      sampleSessionIds,
      caseQIdxes,
      examMeta.isAssignment,
    );
    const sampleStudentsWithPrompts = sampleStudents.map((student) => ({
      ...student,
      answers: student.answers.map((answer) => ({
        ...answer,
        questionPrompt:
          examMeta.caseQuestions.find((q) => q.qIdx === answer.qIdx)?.questionPrompt ?? "",
      })),
    }));

    // Build criteria discussion prompt with fixed sample student data.
    const systemPrompt = [
      buildCriteriaDiscussionSystemPrompt({
        examTitle: examMeta.examTitle,
        examDescription: examMeta.examDescription,
        caseQuestions: examMeta.caseQuestions,
        sampleStudents: sampleStudentsWithPrompts,
        totalSubmittedCount: submittedIds.length,
        language: examMeta.examLanguage,
        isAssignment: examMeta.isAssignment,
      }),
      buildDiscussionOnlyPhaseInstructions(gradingSession, examMeta.examLanguage),
    ].join("\n\n");

    const openAiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    for (const row of historyRows ?? []) {
      if (row.role === "user" || row.role === "assistant") {
        openAiMessages.push({ role: row.role, content: row.content as string });
      }
    }

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL,
          messages: openAiMessages,
          max_completion_tokens: isInit ? 900 : 600,
        }),
      {
        feature: "bulk_grading_chat",
        route: `/api/exam/${examId}/bulk-grade/chat`,
        model: AI_MODEL,
        userId: access.ctx.user.id,
        examId,
        metadata: buildAiTextMetadata({ inputText: [systemPrompt, ...(isInit ? [] : [message])] }),
      },
      {
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as { choices?: Array<{ message?: { content?: string | null } }> })
                .choices?.[0]?.message?.content ?? null,
          }),
      },
    );

    const rawAiContent = stripEmoji(
      tracked.data.choices[0]?.message?.content?.trim() ?? "",
    ).trim();
    if (!rawAiContent) {
      return errorJson("INTERNAL_ERROR", "AI 응답을 받지 못했습니다.", 500);
    }

    const criteriaReadyRange = parseCriteriaReadyMarker(rawAiContent);
    const priorQuestionCount = countInterviewQuestions(
      (historyRows ?? []).filter(
        (r): r is { role: "user" | "assistant"; content: string } =>
          r.role === "user" || r.role === "assistant",
      ),
    );
    const allowCriteriaReady =
      criteriaReadyRange != null &&
      priorQuestionCount >= MIN_BULK_GRADE_INTERVIEW_QUESTIONS;

    const aiContent = stripCriteriaReadyMarker(rawAiContent);
    if (!aiContent) {
      return errorJson("INTERNAL_ERROR", "AI 응답을 받지 못했습니다.", 500);
    }

    if (allowCriteriaReady && criteriaReadyRange) {
      await supabase
        .from("exam_grading_sessions")
        .update({
          calibration_status: "sample_review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", gradingSessionId);
      gradingSession = {
        ...gradingSession,
        calibration_status: "sample_review",
      };
    }

    // Save assistant message
    const assistantPayload: Record<string, unknown> = {
      session_id: gradingSessionId,
      role: "assistant",
      content: aiContent,
      created_by: access.ctx.user.id,
    };
    if (isInit) {
      assistantPayload.id = initAssistantMessageId(gradingSessionId);
    } else {
      assistantPayload.id = assistantMessageIdFromClientMessageId(
        `bulk-grade-chat:${gradingSessionId}`,
        clientMessageId!,
      );
      assistantPayload.client_message_id = clientMessageId;
    }

    const { data: assistantRow, error: assistantError } = await supabase
      .from("bulk_grading_messages")
      .insert(assistantPayload)
      .select("id, role, content, created_at")
      .single();

    if (assistantError || !assistantRow) {
      if (isUniqueViolation(assistantError)) {
        const { messages: existingMessages, error: existingMessagesError } =
          await loadBulkChatMessages(supabase, gradingSessionId);
        if (existingMessagesError) {
          return errorJson("INTERNAL_ERROR", "Failed to load messages", 500);
        }
        const existingAssistant = existingMessages.find(
          (m) => m.id === assistantPayload.id,
        );
        return successJson({
          session: {
            id: gradingSession.id,
            status: gradingSession.status,
            calibration_status: gradingSession.calibration_status,
          },
          assistantMessage: existingAssistant,
          messages: existingMessages,
          ...chatResponseMeta(existingMessages, gradingSession.calibration_status),
        });
      }
      logError("bulk-grade chat: save assistant message failed", assistantError, {
        path: `/api/exam/${examId}/bulk-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to save assistant message", 500);
    }

    const { messages, error: messagesError } = await loadBulkChatMessages(
      supabase,
      gradingSessionId,
    );
    if (messagesError) {
      return errorJson("INTERNAL_ERROR", "Failed to load messages", 500);
    }

    return successJson({
      session: {
        id: gradingSession.id,
        status: gradingSession.status,
        calibration_status: gradingSession.calibration_status,
      },
      assistantMessage: {
        id: assistantRow.id,
        role: assistantRow.role,
        content: assistantRow.content,
        created_at: assistantRow.created_at,
      },
      messages,
      ...chatResponseMeta(messages, gradingSession.calibration_status),
    });
  } catch (error) {
    logError("bulk-grade chat POST handler error", error, {
      path: "/api/exam/bulk-grade/chat",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
