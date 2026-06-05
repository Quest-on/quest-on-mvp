export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { getOpenAI, AI_MODEL_BULK_GRADING_WORKER } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { logError } from "@/lib/logger";
import { bulkGradeWorkerSchema, validateRequest } from "@/lib/validations";
import {
  callTrackedChatCompletion,
  buildAiTextMetadata,
} from "@/lib/ai-tracking";
import {
  asStringArray,
  hasGradesForEveryExpectedQuestion,
  loadSingleStudentCaseData,
  parseGradesFromAiResponse,
} from "@/lib/bulk-grading";
import {
  buildPerStudentGradingSystemPrompt,
  type ExtractedCriteria,
} from "@/lib/prompts";
import { normalizeQuestions, isCaseQuestion } from "@/lib/grading-helpers";
import { stripEmoji } from "@/lib/sanitize";

async function handler(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = validateRequest(bulkGradeWorkerSchema, body);
    if (!validation.success) {
      logError("bulk-grade-worker: invalid payload", null, {
        path: "/api/internal/bulk-grade-worker",
        additionalData: { error: validation.error },
      });
      // Always 200 ack — malformed payload won't fix on retry
      return NextResponse.json({ ok: false, reason: "invalid_payload" }, { status: 200 });
    }

    const { gradingSessionId, studentSessionId, examId, scope, attemptId } = validation.data;
    const supabase = getSupabaseServer();

    // [CRITICAL-1] 4-way join ownership check
    const { data: ownershipCheck, error: ownershipError } = await supabase
      .from("exam_grading_sessions")
      .select(`
        id,
        instructor_id,
        grading_criteria,
        status,
        current_attempt_id,
        exams!inner ( id, questions, language ),
        expected_session_ids
      `)
      .eq("id", gradingSessionId)
      .eq("exam_id", examId)
      .single();

    if (ownershipError || !ownershipCheck) {
      logError("bulk-grade-worker: grading session not found", ownershipError, {
        path: "/api/internal/bulk-grade-worker",
        additionalData: { gradingSessionId, examId },
      });
      return NextResponse.json({ ok: false, reason: "session_not_found" }, { status: 200 });
    }

    if (
      attemptId &&
      (ownershipCheck.current_attempt_id as string | null) !== attemptId
    ) {
      return NextResponse.json({ ok: false, reason: "stale_attempt" }, { status: 200 });
    }

    if ((ownershipCheck.status as string | null) !== "grading") {
      return NextResponse.json({ ok: false, reason: "not_grading" }, { status: 200 });
    }

    const expectedSessionIds = asStringArray(ownershipCheck.expected_session_ids);
    if (expectedSessionIds.length > 0 && !expectedSessionIds.includes(studentSessionId)) {
      return NextResponse.json({ ok: false, reason: "unexpected_student_session" }, { status: 200 });
    }

    // Verify student session belongs to this exam and is submitted
    const { data: studentSession, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, submitted_at")
      .eq("id", studentSessionId)
      .eq("exam_id", examId)
      .not("submitted_at", "is", null)
      .maybeSingle();

    if (sessionError || !studentSession) {
      // Student session doesn't belong to exam — 200 ack, drop
      return NextResponse.json({ ok: false, reason: "invalid_student_session" }, { status: 200 });
    }

    const gradingCriteriaRaw = ownershipCheck.grading_criteria as string | null;
    if (!gradingCriteriaRaw) {
      return NextResponse.json({ ok: false, reason: "no_criteria" }, { status: 200 });
    }

    // Parse stored criteria
    let criteria: ExtractedCriteria;
    try {
      criteria = JSON.parse(gradingCriteriaRaw) as ExtractedCriteria;
    } catch {
      criteria = { criteria_summary: gradingCriteriaRaw, per_question: [] };
    }

    type ExamRow = { id: string; questions: unknown; language: string | null };
    const examData = (ownershipCheck.exams as unknown as ExamRow);
    const questions = normalizeQuestions(examData.questions);
    const caseQuestions = questions
      .filter((q) => isCaseQuestion(q.type))
      .map((q) => ({ qIdx: q.idx, questionPrompt: q.prompt ?? "" }));

    if (caseQuestions.length === 0) {
      return NextResponse.json({ ok: false, reason: "no_case_questions" }, { status: 200 });
    }

    const caseQIdxes = caseQuestions.map((q) => q.qIdx);
    const examLanguage: "ko" | "en" = (examData.language as string) === "en" ? "en" : "ko";

    // Load student case answers
    const studentData = await loadSingleStudentCaseData(supabase, studentSessionId, caseQIdxes);

    // Enrich answer objects with question prompts
    const enrichedAnswers = studentData.answers.map((a) => ({
      ...a,
      questionPrompt: caseQuestions.find((q) => q.qIdx === a.qIdx)?.questionPrompt ?? "",
    }));

    const systemPrompt = buildPerStudentGradingSystemPrompt({
      criteria,
      studentSessionId,
      answers: enrichedAnswers,
      caseQuestions,
      language: examLanguage,
    });

    // [CRITICAL-3] Always 200 ack — AI failures recorded via RPC, not throw
    let success = false;
    const gradesMap: Record<number, { score: number; comment: string }> = {};

    try {
      const tracked = await callTrackedChatCompletion(
        () =>
          getOpenAI().chat.completions.create({
            model: AI_MODEL_BULK_GRADING_WORKER,
            messages: [{ role: "system", content: systemPrompt }],
            max_completion_tokens: 1500,
          }),
        {
          feature: "bulk_grading_chat",
          route: "/api/internal/bulk-grade-worker",
          model: AI_MODEL_BULK_GRADING_WORKER,
          examId,
          sessionId: studentSessionId,
          metadata: buildAiTextMetadata({
            inputText: [systemPrompt],
            extra: { gradingSessionId, studentSessionId },
          }),
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

      const aiContent = tracked.data.choices[0]?.message?.content?.trim() ?? "";
      const validQIdxes = new Set(caseQIdxes);

      const parsed = parseGradesFromAiResponse(
        aiContent,
        new Set([studentSessionId]),
        validQIdxes,
      );

      if (parsed && hasGradesForEveryExpectedQuestion(parsed, caseQIdxes)) {
        for (const g of parsed) {
          gradesMap[g.q_idx] = {
            score: g.score,
            comment: stripEmoji(g.comment).trim(),
          };
        }
        success = true;
      }
    } catch (aiError) {
      logError("bulk-grade-worker: AI call failed", aiError, {
        path: "/api/internal/bulk-grade-worker",
        additionalData: { gradingSessionId, studentSessionId },
      });
    }

    // [CRITICAL-2] Atomic update via RPC
      await supabase.rpc("merge_bulk_grading_result", {
        p_session_id: gradingSessionId,
        p_student_sid: studentSessionId,
        p_grades_json: gradesMap,
        p_success: success,
        p_scope: scope,
        p_attempt_id: attemptId ?? null,
      });

    return NextResponse.json({ ok: true, success, studentSessionId }, { status: 200 });
  } catch (error) {
    logError("bulk-grade-worker: unexpected error", error, {
      path: "/api/internal/bulk-grade-worker",
    });
    // 500 only for infra failures — triggers QStash retry
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
