import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// P1-4: Lazy Supabase getter to avoid stale connections in serverless
function getSupabase() {
  return getSupabaseServer();
}

// 채팅형(과제 계열) 유형만 이 열람 뷰의 대상이다. 시험(exam)은 별도 리포트 경로를 쓴다.
const ASSIGNMENT_TYPES = new Set(["assignment", "report", "code", "erd", "mindmap"]);

/**
 * GET /api/student/assignment/[code]/review
 *
 * 마감된 과제의 본인 기록 읽기 전용 열람. SELECT만 수행하며 점수/채점/루브릭은
 * 응답에 절대 포함하지 않는다(노출: 과제 정보·문제·본인 채팅·최종답안·퀴즈 결과).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;

    if (!code || typeof code !== "string" || code.length > 32) {
      return errorJson("INVALID_CODE", "Invalid assignment code", 400);
    }

    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.role !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    const rl = await checkRateLimitAsync(
      `student-assignment-review:${user.id}`,
      RATE_LIMITS.sessionRead,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // 과제 조회 — 평가 관련 필드(rubric/score_weights/grades_released 등)는 select하지 않는다.
    const { data: exam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, title, code, type, deadline, questions, assignment_prompt")
      .eq("code", code)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Assignment not found", 404);
    }

    if (!exam.type || !ASSIGNMENT_TYPES.has(exam.type)) {
      return errorJson("NOT_ASSIGNMENT", "Not an assignment", 400);
    }

    // 정답/ai_context 등 민감 필드 누출 방지: 채팅 패널이 쓰는 {id,text,type}로만 좁힌다.
    const safeQuestions = (Array.isArray(exam.questions) ? exam.questions : []).map(
      (q: Record<string, unknown>) => ({
        id: typeof q.id === "string" ? q.id : String(q.id ?? ""),
        text: typeof q.text === "string" ? q.text : typeof q.prompt === "string" ? q.prompt : "",
        type: typeof q.type === "string" ? q.type : "essay",
      }),
    );

    const examForClient = {
      id: exam.id,
      title: exam.title,
      code: exam.code,
      assignment_prompt: exam.assignment_prompt ?? null,
      questions: safeQuestions,
    };

    // 본인 세션 조회 (UNIQUE(exam_id, student_id) — ownership 검증 겸용)
    const { data: session } = await getSupabase()
      .from("sessions")
      .select("id, status, submitted_at, final_answer, created_at")
      .eq("exam_id", exam.id)
      .eq("student_id", user.id)
      .maybeSingle();

    // 세션이 없으면 기록 없음 — 페이지가 안내 처리
    if (!session) {
      return successJson({
        exam: examForClient,
        deadline: exam.deadline ?? null,
        session: null,
        messages: [],
        quiz: null,
      });
    }

    // 본인 리서치 채팅 (q_idx=0, 시간순)
    const { data: messageRows } = await getSupabase()
      .from("messages")
      .select("id, role, content, created_at")
      .eq("session_id", session.id)
      .eq("q_idx", 0)
      .order("created_at", { ascending: true });

    const messages = (messageRows || []).map((m) => ({
      id: m.id,
      role: m.role === "ai" ? "assistant" : "user",
      content: m.content,
      created_at: m.created_at,
    }));

    // 타임어택 퀴즈 결과 (있으면)
    const { data: quiz } = await getSupabase()
      .from("session_quiz_attempts")
      .select(
        "id, questions, answers, score, total_questions, time_limit_seconds, started_at, submitted_at, status",
      )
      .eq("session_id", session.id)
      .maybeSingle();

    return successJson({
      exam: examForClient,
      deadline: exam.deadline ?? null,
      session: {
        id: session.id,
        status: session.status,
        submitted_at: session.submitted_at,
        final_answer: session.final_answer ?? null,
        created_at: session.created_at,
      },
      messages,
      quiz: quiz ?? null,
    });
  } catch (error) {
    logError("[assignment-review] Failed", error, {
      path: "/api/student/assignment/[code]/review",
    });
    return errorJson("FETCH_REVIEW_FAILED", "Failed to get assignment review", 500);
  }
}
