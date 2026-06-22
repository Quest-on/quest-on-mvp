import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { sanitizeUserInput } from "@/lib/sanitize";

const FINAL_ANSWER_MAX_LEN = 50_000;
const STATUS_BLOCKING_FINAL_ANSWER_EDIT = new Set([
  "quiz_pending",
  "submitted",
  "auto_submitted",
  "locked",
]);

function getSupabase() {
  return getSupabaseServer();
}

/** Fire-and-forget: dispatch RAG processing to the internal async route. */
function dispatchRAG(
  examId: string,
  materialsText: Array<{ url: string; text: string; fileName: string }>,
  userId: string,
  source: string
) {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  fetch(`${baseUrl}/api/internal/process-rag`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
    },
    body: JSON.stringify({ examId, materialsText, userId, source }),
  }).catch((err) => logError("Failed to dispatch RAG", err));
}

export async function createAssignment(data: {
  title: string;
  code: string;
  deadline: string;
  questions: Array<{ id: string; text: string; type: string; options?: string[] }>;
  materials?: string[];
  materials_text?: Array<{ url: string; text: string; fileName: string }>;
  rubric?: Array<{ evaluationArea: string; detailedCriteria: string }>;
  rubric_public?: boolean;
  chat_weight?: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  parent_folder_id?: string | null;
  assignment_prompt?: string;
  close_at?: string;
  type?: string;
  initial_state?: Record<string, unknown>;
  canvas_config?: Record<string, unknown>;
  language?: "ko" | "en";
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Generate unique exam code (same pattern as createExam)
    let examCode = data.code;
    const { data: existingExam } = await getSupabase()
      .from("exams")
      .select("code")
      .eq("code", examCode)
      .single();

    if (existingExam) {
      const generateExamCode = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < 6; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };

      const MAX_CODE_ATTEMPTS = 10;
      let newCode = generateExamCode();
      let attempts = 0;
      let codeCheck = await getSupabase()
        .from("exams")
        .select("code")
        .eq("code", newCode)
        .maybeSingle();

      while (codeCheck.data !== null) {
        if (++attempts >= MAX_CODE_ATTEMPTS) {
          throw new Error("Failed to generate unique exam code after maximum attempts");
        }
        newCode = generateExamCode();
        codeCheck = await getSupabase()
          .from("exams")
          .select("code")
          .eq("code", newCode)
          .maybeSingle();
      }
      examCode = newCode;
    }

    // Ensure at least one placeholder question for assignments
    const questions = data.questions.length > 0
      ? data.questions
      : [{ id: "assignment-q0", text: "과제", type: "essay" }];

    const examData = {
      title: data.title,
      code: examCode,
      description: null,
      duration: 0, // assignments have no time limit
      questions: questions,
      materials: data.materials || [],
      materials_text: data.materials_text || [],
      rubric: data.rubric || [],
      rubric_public: data.rubric_public || false,
      chat_weight: data.chat_weight ?? 50,
      status: data.status,
      instructor_id: user.id,
      created_at: data.created_at,
      updated_at: data.updated_at,
      type: "assignment",
      deadline: data.deadline,
      assignment_prompt: data.assignment_prompt || null,
    };

    const parentId = data.parent_folder_id || null;

    const MAX_INSERT_RETRIES = 3;
    let rpcResult: { exam: Record<string, unknown> & { id: string }; exam_node: Record<string, unknown> } | null = null;
    let lastInsertError = null;

    for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
      const { data: rpcData, error: rpcError } = await getSupabase()
        .rpc("create_exam_with_node", {
          p_title: examData.title,
          p_code: examData.code,
          p_description: examData.description,
          p_duration: examData.duration,
          p_questions: examData.questions,
          p_materials: examData.materials,
          p_materials_text: examData.materials_text,
          p_rubric: examData.rubric,
          p_rubric_public: examData.rubric_public,
          p_chat_weight: examData.chat_weight,
          p_status: examData.status,
          p_instructor_id: examData.instructor_id,
          p_created_at: examData.created_at,
          p_updated_at: examData.updated_at,
          p_parent_folder_id: parentId,
        });

      if (!rpcError) {
        rpcResult = rpcData as { exam: Record<string, unknown> & { id: string }; exam_node: Record<string, unknown> };
        lastInsertError = null;
        break;
      }

      if (rpcError.code === "23505" && attempt < MAX_INSERT_RETRIES - 1) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let retryCode = "";
        for (let i = 0; i < 6; i++) {
          retryCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        examData.code = retryCode;
        examCode = retryCode;
        continue;
      }

      lastInsertError = rpcError;
      break;
    }

    if (lastInsertError || !rpcResult) {
      logError("[createAssignment] Database error", lastInsertError, { path: "/api/supa/assignment-handlers" });
      return errorJson("DATABASE_ERROR", "Database error", 500);
    }

    const exam = rpcResult.exam;
    const examNode = rpcResult.exam_node;

    // Update type, deadline, and hybrid workspace fields (RPC doesn't know about these)
    const assignmentType = data.type || "assignment";
    const updatePayload: Record<string, unknown> = {
      type: assignmentType,
      deadline: examData.deadline,
      close_at: data.close_at || examData.deadline,
      assignment_prompt: examData.assignment_prompt,
      initial_state: data.initial_state || {},
      canvas_config: data.canvas_config || {},
    };
    // 'ko'는 DB 기본값으로 처리되므로, 'en'인 경우에만 명시적으로 반영
    if (data.language === "en") {
      updatePayload.language = "en";
    }
    await getSupabase()
      .from("exams")
      .update(updatePayload)
      .eq("id", exam.id);

    // RAG dispatch
    if (
      examData.materials_text &&
      Array.isArray(examData.materials_text) &&
      examData.materials_text.length > 0
    ) {
      await getSupabase()
        .from("exams")
        .update({ rag_status: "pending" })
        .eq("id", exam.id);

      dispatchRAG(
        exam.id,
        examData.materials_text as Array<{ url: string; text: string; fileName: string }>,
        user.id,
        "create_assignment_materials"
      );
    }

    return successJson({
      exam: { ...exam, type: "assignment", deadline: examData.deadline },
      examNode,
    });
  } catch (error) {
    logError("[createAssignment] Failed", error, { path: "/api/supa/assignment-handlers" });
    return errorJson("CREATE_ASSIGNMENT_FAILED", "Failed to create assignment", 500);
  }
}

export async function updateAssignment(data: {
  id: string;
  update: {
    title?: string;
    questions?: unknown;
    language?: "ko" | "en";
    deadline?: string | null;
    close_at?: string | null;
    updated_at?: string;
  };
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Ownership + type check
    const { data: examRow, error: fetchError } = await getSupabase()
      .from("exams")
      .select("id, instructor_id, type")
      .eq("id", data.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!examRow) {
      return errorJson("NOT_FOUND", "Assignment not found", 404);
    }
    if (examRow.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    // Defense-in-depth: block question edits when any session exists
    if (data.update.questions !== undefined) {
      const { data: sessions } = await getSupabase()
        .from("sessions")
        .select("id")
        .eq("exam_id", data.id)
        .limit(1);

      if (sessions && sessions.length > 0) {
        return errorJson(
          "QUESTIONS_LOCKED",
          "참여한 학생이 있어 문항을 수정할 수 없습니다",
          409
        );
      }
    }

    // Whitelist — never touch code, type, score_weights
    const { title, questions, language, deadline, close_at, updated_at } = data.update;
    const updatePayload: Record<string, unknown> = {
      updated_at: updated_at ?? new Date().toISOString(),
    };
    if (title !== undefined) updatePayload.title = title;
    if (questions !== undefined) updatePayload.questions = questions;
    if (language !== undefined) updatePayload.language = language;
    if (deadline !== undefined) updatePayload.deadline = deadline;
    if (close_at !== undefined) updatePayload.close_at = close_at;

    const { error: updateError } = await getSupabase()
      .from("exams")
      .update(updatePayload)
      .eq("id", data.id);

    if (updateError) {
      logError("[updateAssignment] DB error", updateError, { path: "/api/supa/assignment-handlers" });
      return errorJson("UPDATE_ASSIGNMENT_FAILED", "Failed to update assignment", 500);
    }

    return successJson({ updated: true });
  } catch (error) {
    logError("[updateAssignment] Failed", error, { path: "/api/supa/assignment-handlers" });
    return errorJson("UPDATE_ASSIGNMENT_FAILED", "Failed to update assignment", 500);
  }
}

export async function saveCanvas(data: {
  sessionId: string;
  content: string;
  workspace_state?: Record<string, unknown>;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Verify session ownership
    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select("id, student_id")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Session does not belong to this user", 403);
    }

    // Upsert canvas content as q_idx=0 submission
    const upsertData: Record<string, unknown> = {
      session_id: data.sessionId,
      q_idx: 0,
      answer: data.content,
      updated_at: new Date().toISOString(),
    };
    if (data.workspace_state) {
      upsertData.workspace_state = data.workspace_state;
    }

    const { error } = await getSupabase()
      .from("submissions")
      .upsert(upsertData, { onConflict: "session_id,q_idx" });

    if (error) {
      logError("[saveCanvas] DB error", error, { path: "/api/supa/assignment-handlers" });
      return errorJson("SAVE_CANVAS_FAILED", "Failed to save canvas", 500);
    }

    return successJson({ saved: true });
  } catch (error) {
    logError("[saveCanvas] Failed", error, { path: "/api/supa/assignment-handlers" });
    return errorJson("SAVE_CANVAS_FAILED", "Failed to save canvas", 500);
  }
}

export async function submitAssignment(data: {
  sessionId: string;
  examId: string;
  studentId: string;
  deadlineAutoSubmit?: boolean;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    if (user.id !== data.studentId) {
      return errorJson("FORBIDDEN", "Student ID mismatch", 403);
    }

    // Verify session (final_answer 포함)
    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select("id, student_id, submitted_at, exam_id, status, final_answer")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Session does not belong to this user", 403);
    }

    if (session.submitted_at) {
      return errorJson("ALREADY_SUBMITTED", "Already submitted", 409);
    }

    if (session.exam_id !== data.examId) {
      return errorJson("EXAM_MISMATCH", "Session does not belong to this assignment", 400);
    }

    if (session.status === "quiz_pending") {
      return successJson({ quizPending: true, sessionId: data.sessionId });
    }

    // 마감 시각 확인 (서버에서 직접 — 클라이언트 플래그 신뢰 금지)
    const { data: examRow, error: examFetchError } = await getSupabase()
      .from("exams")
      .select("id, deadline")
      .eq("id", data.examId)
      .single();

    if (examFetchError || !examRow) {
      return errorJson("EXAM_NOT_FOUND", "Assignment not found", 404);
    }

    const finalAnswer = (session.final_answer ?? "").trim();
    const deadlinePassed = !!examRow.deadline && new Date(examRow.deadline as string).getTime() < Date.now();

    // 마감 전인데 최종답안이 비어 있으면 차단 (클라이언트가 sheet를 자동으로 열어 작성을 강제)
    if (!finalAnswer && !deadlinePassed) {
      return errorJson("FINAL_ANSWER_REQUIRED", "Final answer is required before submission", 400, {
        reason: "final_answer_missing",
      });
    }

    // Submission intent freezes the chat and moves the student into the required quiz.
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status: "quiz_pending",
      is_active: false,
      last_heartbeat_at: now,
    };
    if (data.deadlineAutoSubmit) {
      if (!deadlinePassed) {
        return errorJson("BAD_REQUEST", "Deadline has not passed yet", 400);
      }
      updatePayload.auto_submitted = true;
    } else if (deadlinePassed && !finalAnswer) {
      updatePayload.auto_submitted = true;
    }

    const { error: updateError } = await getSupabase()
      .from("sessions")
      .update(updatePayload)
      .eq("id", data.sessionId);

    if (updateError) {
      logError("[submitAssignment] Update error", updateError, { path: "/api/supa/assignment-handlers" });
      return errorJson("SUBMIT_FAILED", "Failed to submit assignment", 500);
    }

    return successJson({ quizPending: true, sessionId: data.sessionId, quizStartedAt: now });
  } catch (error) {
    logError("[submitAssignment] Failed", error, { path: "/api/supa/assignment-handlers" });
    return errorJson("SUBMIT_ASSIGNMENT_FAILED", "Failed to submit assignment", 500);
  }
}

export async function saveFinalAnswer(data: {
  sessionId: string;
  examId: string;
  studentId: string;
  finalAnswer: string;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    if (user.id !== data.studentId) {
      return errorJson("FORBIDDEN", "Student ID mismatch", 403);
    }

    // Verify session ownership + not already in quiz/submitted phase
    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select("id, student_id, exam_id, status, submitted_at")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Session does not belong to this user", 403);
    }

    if (session.exam_id !== data.examId) {
      return errorJson("EXAM_MISMATCH", "Session does not belong to this assignment", 400);
    }

    if (session.submitted_at || (session.status && STATUS_BLOCKING_FINAL_ANSWER_EDIT.has(session.status))) {
      return errorJson("FINAL_ANSWER_LOCKED", "Final answer cannot be edited after submission", 409);
    }

    // Sanitize HTML & enforce length on sanitized text (UI 카운터 mismatch 방지)
    const sanitized = sanitizeUserInput(data.finalAnswer ?? "");
    if (sanitized.length > FINAL_ANSWER_MAX_LEN) {
      return errorJson("FINAL_ANSWER_TOO_LONG", "Final answer too long", 400);
    }

    const now = new Date().toISOString();
    const { error: updateError } = await getSupabase()
      .from("sessions")
      .update({
        final_answer: sanitized,
        final_answer_updated_at: now,
      })
      .eq("id", data.sessionId);

    if (updateError) {
      logError("[saveFinalAnswer] Update error", updateError, { path: "/api/supa/assignment-handlers" });
      return errorJson("SAVE_FINAL_ANSWER_FAILED", "Failed to save final answer", 500);
    }

    return successJson({ saved: true, finalAnswerUpdatedAt: now, length: sanitized.length });
  } catch (error) {
    logError("[saveFinalAnswer] Failed", error, { path: "/api/supa/assignment-handlers" });
    return errorJson("SAVE_FINAL_ANSWER_FAILED", "Failed to save final answer", 500);
  }
}
