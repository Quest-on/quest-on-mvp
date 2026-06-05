import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import {
  buildDefaultScoreWeightsForQuestionTypes,
  normalizeScoreWeights,
  validateScoreWeightsForQuestions,
  type ScoreWeights,
} from "@/lib/grade-utils";

// Lazy Supabase client getter — creates a fresh client per invocation
// to avoid stale connections in serverless environments
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

export interface QuestionData {
  id: string;
  text: string;
  type: "multiple-choice" | "essay" | "short-answer";
  options?: string[];
}

export async function createExam(data: {
  title: string;
  code: string;
  duration: number;
  questions: QuestionData[];
  materials?: string[];
  materials_text?: Array<{
    url: string;
    text: string;
    fileName: string;
  }>;
  chat_weight?: number | null;
  score_weights?: ScoreWeights | null;
  status: string;
  created_at: string;
  updated_at: string;
  parent_folder_id?: string | null;
  language?: "ko" | "en";
}) {
  try {
    // Get current user
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.role;

    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // 시험 코드 중복 검증 및 자동 재생성
    let examCode = data.code;
    const { data: existingExam } = await getSupabase()
      .from("exams")
      .select("code")
      .eq("code", examCode)
      .single();

    if (existingExam) {
      // 중복 시 새 코드 생성
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

    // Create exam with the correct schema
    // NOTE: core_ability(핵심 역량) 필드는 제거되었으므로 저장 시 항상 제거한다.
    const sanitizedQuestions = (data.questions || []).map((q) => {
      const rest = { ...q } as QuestionData & { core_ability?: unknown };
      delete rest.core_ability;
      return rest;
    });
    const normalizedScoreWeights = normalizeScoreWeights(data.score_weights);
    if (data.score_weights !== null && data.score_weights !== undefined && !normalizedScoreWeights) {
      return errorJson(
        "INVALID_SCORE_WEIGHTS",
        "유효하지 않은 점수 배점입니다.",
        400
      );
    }
    const scoreWeights =
      normalizedScoreWeights ??
      buildDefaultScoreWeightsForQuestionTypes(
        sanitizedQuestions.map((q) => q.type)
      );
    const scoreWeightErrors = validateScoreWeightsForQuestions(
      scoreWeights,
      sanitizedQuestions.map((q) => q.type)
    );
    if (scoreWeightErrors.length > 0) {
      return errorJson("INVALID_SCORE_WEIGHTS", scoreWeightErrors[0], 400, {
        errors: scoreWeightErrors,
      });
    }

    const examData = {
      title: data.title,
      code: examCode,
      description: null, // description 필드는 nullable이므로 null로 설정
      duration: data.duration,
      questions: sanitizedQuestions,
      materials: data.materials || [],
      materials_text: data.materials_text || [], // 추출된 텍스트 저장
      chat_weight: data.chat_weight ?? 50,
      score_weights: scoreWeights,
      status: data.status,
      instructor_id: user.id, // Clerk user ID (e.g., "user_31ihNg56wMaE27ft10H4eApjc1J")
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    const parentId = data.parent_folder_id || null;

    const MAX_INSERT_RETRIES = 3;
    let insertedExam: (Record<string, unknown> & { id: string }) | null = null;
    let lastInsertError = null;

    for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
      const { data: examInsertData, error: insertError } = await getSupabase()
        .from("exams")
        .insert(examData)
        .select()
        .single();

      if (!insertError) {
        insertedExam = examInsertData as Record<string, unknown> & { id: string };
        lastInsertError = null;
        break;
      }

      // Postgres UNIQUE violation = code 23505 → 코드 재생성 후 재시도
      if (insertError.code === "23505" && attempt < MAX_INSERT_RETRIES - 1) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let retryCode = "";
        for (let i = 0; i < 6; i++) {
          retryCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        examData.code = retryCode;
        examCode = retryCode;
        continue;
      }

      lastInsertError = insertError;
      break;
    }

    if (lastInsertError || !insertedExam) {
      logError("[createExam] Database error during exam insert", lastInsertError, { path: "/api/supa/exam-handlers" });
      return errorJson("DATABASE_ERROR", "Database error", 500);
    }

    const exam = insertedExam;

    let maxNodeQuery = getSupabase()
      .from("exam_nodes")
      .select("sort_order")
      .eq("instructor_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1);

    maxNodeQuery = parentId === null
      ? maxNodeQuery.is("parent_id", null)
      : maxNodeQuery.eq("parent_id", parentId);

    const { data: maxNode } = await maxNodeQuery.maybeSingle();

    const { data: examNode, error: nodeError } = await getSupabase()
      .from("exam_nodes")
      .insert({
        instructor_id: user.id,
        parent_id: parentId,
        kind: "exam",
        name: examData.title,
        exam_id: exam.id,
        sort_order:
          typeof maxNode?.sort_order === "number" ? maxNode.sort_order + 1 : 0,
      })
      .select()
      .single();

    if (nodeError) {
      await getSupabase().from("exams").delete().eq("id", exam.id);
      logError("[createExam] Database error during exam node insert", nodeError, { path: "/api/supa/exam-handlers" });
      return errorJson("DATABASE_ERROR", "Database error", 500);
    }

    // 언어 설정 (기본값 'ko'는 DB 기본값으로 처리되므로, 'en'인 경우에만 업데이트)
    if (data.language === "en") {
      const { error: languageError } = await getSupabase()
        .from("exams")
        .update({ language: "en" })
        .eq("id", exam.id);

      if (languageError) {
        logError("[createExam] Failed to set exam language", languageError, {
          path: "/api/supa/exam-handlers",
        });
      } else {
        exam.language = "en";
      }
    }

    // RAG: materials_text가 있으면 비동기 RAG 처리 디스패치
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
        "create_exam_materials"
      );
    }

    return successJson({ exam, examNode });
  } catch (error) {
    logError("[createExam] Failed to create exam", error, { path: "/api/supa/exam-handlers" });
    return errorJson("CREATE_EXAM_FAILED", "Failed to create exam", 500);
  }
}

export async function updateExam(data: {
  id: string;
  update: Record<string, unknown>;
}) {
  try {
    // Require instructor auth + ownership
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const needsCurrentExam =
      data.update.code !== undefined ||
      "score_weights" in data.update ||
      "questions" in data.update;
    let currentExam: {
      id: string;
      questions: unknown;
      score_weights: unknown;
    } | null = null;

    if (needsCurrentExam) {
      const { data: foundExam, error: findError } = await getSupabase()
        .from("exams")
        .select("id, questions, score_weights")
        .eq("id", data.id)
        .eq("instructor_id", user.id)
        .maybeSingle();

      if (findError) throw findError;
      if (!foundExam) {
        return errorJson("EXAM_NOT_FOUND", "Exam not found or access denied", 404);
      }
      currentExam = foundExam as {
        id: string;
        questions: unknown;
        score_weights: unknown;
      };
    }

    // If exam code is being changed, verify no sessions exist
    if (data.update.code !== undefined) {
      const { data: sessions } = await getSupabase()
        .from("sessions")
        .select("id")
        .eq("exam_id", data.id)
        .limit(1);

      if (sessions && sessions.length > 0) {
        return errorJson(
          "CODE_LOCKED",
          "학생이 이미 참여한 시험의 코드는 변경할 수 없습니다.",
          409
        );
      }
    }

    const updateWithoutRubric = { ...data.update };
    delete updateWithoutRubric.rubric;
    delete updateWithoutRubric.rubric_public;

    if ("questions" in updateWithoutRubric) {
      const currentQuestions = Array.isArray(currentExam?.questions)
        ? currentExam.questions
        : [];
      const nextQuestions = Array.isArray(updateWithoutRubric.questions)
        ? updateWithoutRubric.questions
        : [];
      const questionsChanged =
        JSON.stringify(currentQuestions) !== JSON.stringify(nextQuestions);

      if (questionsChanged) {
        const { data: sessions } = await getSupabase()
          .from("sessions")
          .select("id")
          .eq("exam_id", data.id)
          .limit(1);

        if (sessions && sessions.length > 0) {
          return errorJson(
            "QUESTIONS_LOCKED",
            "학생이 이미 참여한 시험의 문항은 변경할 수 없습니다.",
            409
          );
        }
      }
    }

    if ("score_weights" in updateWithoutRubric || "questions" in updateWithoutRubric) {
      const nextQuestions = Array.isArray(updateWithoutRubric.questions)
        ? updateWithoutRubric.questions
        : Array.isArray(currentExam?.questions)
          ? currentExam.questions
          : [];
      const currentScoreWeights = normalizeScoreWeights(currentExam?.score_weights);
      const hasScoreWeightsUpdate = "score_weights" in updateWithoutRubric;
      let scoreWeights = hasScoreWeightsUpdate
        ? normalizeScoreWeights(updateWithoutRubric.score_weights)
        : currentScoreWeights;
      if (
        hasScoreWeightsUpdate &&
        updateWithoutRubric.score_weights !== null &&
        !scoreWeights
      ) {
        return errorJson(
          "INVALID_SCORE_WEIGHTS",
          "유효하지 않은 점수 배점입니다.",
          400
        );
      }

      const nextQuestionTypes = nextQuestions.map((q) => {
        const type =
          q && typeof q === "object" && "type" in q
            ? (q as { type?: unknown }).type
            : undefined;
        return typeof type === "string" ? type : undefined;
      });
      const defaultScoreWeights =
        buildDefaultScoreWeightsForQuestionTypes(nextQuestionTypes);
      if (
        hasScoreWeightsUpdate &&
        updateWithoutRubric.score_weights === null &&
        defaultScoreWeights
      ) {
        return errorJson(
          "INVALID_SCORE_WEIGHTS",
          "문항이 있는 시험에는 최종 점수 비중을 설정해야 합니다.",
          400
        );
      }
      if (nextQuestionTypes.length > 0 && !scoreWeights) {
        // 기존 시험(score_weights null)을 편집할 때 기본 비중으로 자동 설정
        scoreWeights = defaultScoreWeights;
      }
      const scoreWeightErrors = validateScoreWeightsForQuestions(
        scoreWeights,
        nextQuestionTypes
      );
      if (scoreWeightErrors.length > 0) {
        return errorJson("INVALID_SCORE_WEIGHTS", scoreWeightErrors[0], 400, {
          errors: scoreWeightErrors,
        });
      }

      const scoreWeightsChanged =
        hasScoreWeightsUpdate &&
        JSON.stringify(currentScoreWeights) !== JSON.stringify(scoreWeights);
      if (scoreWeightsChanged) {
        const { data: sessions } = await getSupabase()
          .from("sessions")
          .select("id")
          .eq("exam_id", data.id)
          .limit(1);

        if (sessions && sessions.length > 0) {
          return errorJson(
            "SCORE_WEIGHTS_LOCKED",
            "학생이 이미 참여한 시험의 점수 비중은 변경할 수 없습니다.",
            409
          );
        }
      }
      if (hasScoreWeightsUpdate) {
        updateWithoutRubric.score_weights = scoreWeights;
      }
    }

    const { data: exam, error } = await getSupabase()
      .from("exams")
      .update(updateWithoutRubric)
      .eq("id", data.id)
      .eq("instructor_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found or access denied", 404);
      }
      throw error;
    }

    // Audit log: exam status change (awaited for critical operations)
    if (data.update.status) {
      await auditLog({
        action: "exam_status_change",
        userId: user.id,
        targetId: data.id,
        details: { newStatus: data.update.status },
      });
    }

    return successJson({ exam });
  } catch (error) {
    logError("[updateExam] Failed to update exam", error, { path: "/api/supa/exam-handlers" });
    return errorJson("UPDATE_EXAM_FAILED", "Failed to update exam", 500);
  }
}

export async function getExam(data: { code: string }) {
  try {
    const { data: exam, error } = await getSupabase()
      .from("exams")
      .select("id, title, code, description, duration, questions, rubric, rubric_public, chat_weight, score_weights, status, instructor_id, materials, created_at, updated_at, open_at, close_at, started_at, allow_draft_in_waiting, allow_chat_in_waiting, type, deadline, assignment_prompt")
      .eq("code", data.code)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
      }
      throw error;
    }

    // Strip sensitive data from public endpoint:
    // Remove rubric when rubric_public is false (respects instructor privacy setting)
    const sanitizedExam = {
      ...exam,
      ...(exam.rubric_public === false ? { rubric: null } : {}),
    };

    return successJson({ exam: sanitizedExam });
  } catch (error) {
    logError("[getExam] Failed to get exam", error, { path: "/api/supa/exam-handlers" });
    return errorJson("GET_EXAM_FAILED", "Failed to get exam", 500);
  }
}

export async function getExamById(data: { id: string }) {
  try {
    // Validate input
    if (!data || !data.id) {
      return errorJson("MISSING_EXAM_ID", "Missing exam ID", 400);
    }

    if (typeof data.id !== "string" || data.id.trim() === "") {
      return errorJson("INVALID_EXAM_ID", "Invalid exam ID", 400);
    }

    // Get current user
    let user;
    try {
      user = await currentUser();
    } catch (authError) {
      logError("[getExamById] Authentication error", authError, { path: "/api/supa/exam-handlers" });
      return errorJson("AUTH_ERROR", "Authentication error", 401);
    }

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.role;

    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // First, check if exam exists at all (without instructor filter)
    const { data: examExists, error: checkError } = await getSupabase()
      .from("exams")
      .select("id, instructor_id")
      .eq("id", data.id)
      .single();

    if (checkError) {
      if (checkError.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
      }
      throw checkError;
    }

    // Check if exam belongs to this instructor
    if (examExists && examExists.instructor_id !== user.id) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    // Now fetch the full exam data (Gate 필드 포함)
    const { data: exam, error } = await getSupabase()
      .from("exams")
      .select(
        "id, title, code, description, duration, questions, materials, materials_text, rubric, rubric_public, chat_weight, score_weights, status, instructor_id, created_at, updated_at, open_at, close_at, started_at, allow_draft_in_waiting, allow_chat_in_waiting, type, deadline, assignment_prompt, grades_released, language"
      )
      .eq("id", data.id)
      .eq("instructor_id", user.id) // Only allow instructors to view their own exams
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
      }
      throw error;
    }

    if (!exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    const { data: sessions } = await getSupabase()
      .from("sessions")
      .select("id")
      .eq("exam_id", data.id)
      .limit(1);

    return successJson({
      exam: {
        ...exam,
        has_sessions: Boolean(sessions && sessions.length > 0),
      },
    });
  } catch (error) {
    logError("[getExamById] Failed to get exam", error, { path: "/api/supa/exam-handlers" });
    return errorJson("GET_EXAM_FAILED", "Failed to get exam", 500);
  }
}

export async function getInstructorExams() {
  try {
    // Get current user
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const { data: exams, error } = await getSupabase()
      .from("exams")
      .select(
        "id, title, code, description, duration, questions, materials, status, instructor_id, created_at, updated_at, type, deadline"
      )
      .eq("instructor_id", user.id) // Clerk user ID
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Batch fetch all session student_ids in a single query (N+1 → 2 queries)
    const examIds = (exams || []).map((e) => e.id);
    const studentCountMap = new Map<string, number>();

    if (examIds.length > 0) {
      const { data: allSessions } = await getSupabase()
        .from("sessions")
        .select("exam_id, student_id")
        .in("exam_id", examIds)
        .limit(10000);

      if (allSessions) {
        // Group by exam_id and count distinct student_ids
        const examStudents = new Map<string, Set<string>>();
        for (const session of allSessions) {
          if (!examStudents.has(session.exam_id)) {
            examStudents.set(session.exam_id, new Set());
          }
          examStudents.get(session.exam_id)!.add(session.student_id);
        }
        for (const [examId, students] of examStudents) {
          studentCountMap.set(examId, students.size);
        }
      }
    }

    const examsWithCounts = (exams || []).map((exam) => ({
      ...exam,
      questionsCount: Array.isArray(exam.questions) ? exam.questions.length : 0,
      student_count: studentCountMap.get(exam.id) || 0,
    }));

    return successJson({ exams: examsWithCounts });
  } catch (error) {
    logError("[getInstructorExams] Failed to get exams", error, { path: "/api/supa/exam-handlers" });
    return errorJson("GET_EXAMS_FAILED", "Failed to get exams", 500);
  }
}

export async function copyExam(data: { exam_id: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Get the original exam
    const { data: originalExam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, title, code, description, duration, questions, materials, materials_text, rubric, rubric_public, chat_weight, score_weights, status, instructor_id, created_at, updated_at, language")
      .eq("id", data.exam_id)
      .eq("instructor_id", user.id)
      .single();

    if (examError || !originalExam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found or access denied", 404);
    }

    // Get the original exam node to preserve parent folder
    const { data: originalNode, error: nodeError } = await getSupabase()
      .from("exam_nodes")
      .select("id, parent_id, sort_order")
      .eq("exam_id", data.exam_id)
      .eq("instructor_id", user.id)
      .single();

    if (nodeError || !originalNode) {
      logError("Original exam node not found", nodeError, { path: "/api/supa", user_id: user.id, additionalData: { examId: data.exam_id } });
    }

    // Generate new exam code
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

    // Prepare copied exam data
    const newTitle = `${originalExam.title} (복사본)`;
    const now = new Date().toISOString();

    // Sanitize questions (remove core_ability if present)
    const sanitizedQuestions = Array.isArray(originalExam.questions)
      ? originalExam.questions.map((q: QuestionData & { core_ability?: unknown }) => {
          const rest = { ...q };
          delete rest.core_ability;
          return rest;
        })
      : [];

    const examData = {
      title: newTitle,
      code: newCode,
      description: originalExam.description || null,
      duration: originalExam.duration,
      questions: sanitizedQuestions,
      materials: originalExam.materials || [],
      materials_text: originalExam.materials_text || [], // 복사본도 materials_text 포함
      rubric: originalExam.rubric || [],
      rubric_public: originalExam.rubric_public || false,
      chat_weight: originalExam.chat_weight ?? 50,
      score_weights: normalizeScoreWeights(originalExam.score_weights),
      status: "draft", // 복사본은 초안 상태로 시작
      instructor_id: user.id,
      created_at: now,
      updated_at: now,
      language: (originalExam as { language?: string }).language === "en" ? "en" : "ko",
    };

    // Create the new exam
    const { data: newExam, error: createError } = await getSupabase()
      .from("exams")
      .insert([examData])
      .select()
      .single();

    if (createError || !newExam) {
      return errorJson("COPY_EXAM_FAILED", "Failed to create copied exam", 500);
    }

    // Create exam node (preserve parent folder)
    const parentId = originalNode?.parent_id || null;

    // Get the maximum sort_order for this parent folder
    let sortQuery = getSupabase()
      .from("exam_nodes")
      .select("sort_order")
      .eq("instructor_id", user.id);

    if (parentId === null) {
      sortQuery = sortQuery.is("parent_id", null);
    } else {
      sortQuery = sortQuery.eq("parent_id", parentId);
    }

    const { data: existingNodes } = await sortQuery
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder =
      existingNodes && existingNodes.length > 0
        ? existingNodes[0].sort_order + 1
        : 0;

    const { data: examNode, error: nodeCreateError } = await getSupabase()
      .from("exam_nodes")
      .insert([
        {
          instructor_id: user.id,
          parent_id: parentId,
          kind: "exam",
          name: newTitle,
          exam_id: newExam.id,
          sort_order: nextSortOrder,
        },
      ])
      .select()
      .single();

    if (nodeCreateError) {
      // Exam is created but node creation failed - this is not critical
      logError("Failed to create exam node for copy", nodeCreateError, { path: "/api/supa", user_id: user.id, additionalData: { examId: newExam.id } });
    }

    // RAG: materials_text가 있으면 비동기 RAG 처리 디스패치
    if (
      examData.materials_text &&
      Array.isArray(examData.materials_text) &&
      examData.materials_text.length > 0
    ) {
      await getSupabase()
        .from("exams")
        .update({ rag_status: "pending" })
        .eq("id", newExam.id);

      dispatchRAG(
        newExam.id,
        examData.materials_text as Array<{ url: string; text: string; fileName: string }>,
        user.id,
        "copy_exam_materials"
      );
    }

    return successJson({ exam: newExam, examNode });
  } catch (error) {
    logError("[copyExam] Failed to copy exam", error, { path: "/api/supa/exam-handlers" });
    return errorJson("COPY_EXAM_FAILED", "Failed to copy exam", 500);
  }
}
