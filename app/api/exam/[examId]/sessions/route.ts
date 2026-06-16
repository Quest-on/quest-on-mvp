import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { batchGetUserInfo } from "@/lib/app-users";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { buildAssignmentScoreMap, isAssignmentType } from "@/lib/grading-helpers";

export const maxDuration = 30;

// Initialize Supabase client
const supabase = getSupabaseServer();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const { examId } = await params;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    let user;
    try {
      user = await currentUser();
    } catch (clerkError) {
      return errorJson("INTERNAL_ERROR", "Authentication service error", 500);
    }

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(`exam-sessions:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    // Check if user is instructor
    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get exam to verify instructor owns it
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, instructor_id, type")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Parse pagination params (default: page 1, pageSize 50, max 100)
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get("pageSize") || "50", 10)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const statusFilter = url.searchParams.get("status");

    // Get total count for pagination metadata
    let countQuery = supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", examId);
    if (statusFilter) {
      countQuery = countQuery.eq("status", statusFilter);
    }
    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      throw countError;
    }

    // Optimized: Only fetch minimal session data needed for student list
    // Don't fetch submissions/messages as they're not needed for the list view
    let sessionsQuery = supabase
      .from("sessions")
      .select(
        `
        id,
        student_id,
        submitted_at,
        used_clarifications,
        created_at,
        status,
        is_active,
        last_heartbeat_at,
        grading_progress
      `,
      )
      .eq("exam_id", examId);
    if (statusFilter) {
      sessionsQuery = sessionsQuery.eq("status", statusFilter);
    }
    const { data: sessions, error: sessionsError } = await sessionsQuery
      .order("submitted_at", { ascending: false, nullsFirst: true })
      .range(from, to);

    if (sessionsError) {
      throw sessionsError;
    }

    // Get unique student IDs
    const uniqueStudentIds = [...new Set(sessions.map((s) => s.student_id))];

    // Fetch student profiles from database
    const { data: studentProfiles } = await supabase
      .from("student_profiles")
      .select("student_id, name, student_number, school")
      .in("student_id", uniqueStudentIds);

    // Create a map of student profiles by student_id
    const studentProfileMap = new Map<
      string,
      { name: string; student_number: string; school: string }
    >();
    if (studentProfiles) {
      studentProfiles.forEach((profile) => {
        studentProfileMap.set(profile.student_id, {
          name: profile.name,
          student_number: profile.student_number,
          school: profile.school,
        });
      });
    }

    // Batch fetch all student info from Clerk (single API call)
    const clerkUserMap = await batchGetUserInfo(uniqueStudentIds);

    const studentInfoMap = new Map<
      string,
      { name: string; email: string; student_number?: string; school?: string }
    >();
    for (const studentId of uniqueStudentIds) {
      const info = clerkUserMap.get(studentId);
      const profile = studentProfileMap.get(studentId);

      if (info) {
        studentInfoMap.set(studentId, {
          name: profile?.name || info.name,
          email: info.email,
          student_number: profile?.student_number,
          school: profile?.school,
        });
      }
    }

    // 과제(assignment)는 q_idx=0 단일 문항을 확정(grade_type="manual")했을 때만 점수를 노출한다.
    // (가채점은 commit 전까지 grades에 기록되지 않으므로 manual row 존재 = 확정된 점수)
    // 시험은 별도 인프라(student-summaries)가 점수를 집계하므로 여기서는 점수를 채우지 않는다.
    let scoreBySession = new Map<string, number>();
    if (isAssignmentType(exam.type as string | null)) {
      const sessionIds = sessions.map((s) => s.id);
      if (sessionIds.length > 0) {
        const { data: gradeRows, error: gradesError } = await supabase
          .from("grades")
          .select("session_id, score")
          .in("session_id", sessionIds)
          .eq("q_idx", 0)
          .eq("grade_type", "manual");
        if (gradesError) {
          logError("sessions: assignment grades fetch failed", gradesError, {
            path: `/api/exam/${examId}/sessions`,
          });
        } else {
          scoreBySession = buildAssignmentScoreMap(
            (gradeRows ?? []) as Array<{ session_id: string; score: unknown }>,
          );
        }
      }
    }

    // Optimized: Process sessions without decompression (not needed for list view)
    const processedSessions = sessions.map((session) => {
      // Get student info from map
      const studentInfo = studentInfoMap.get(session.student_id) || {
        name: `Student ${session.student_id.slice(0, 8)}`,
        email: `${session.student_id}@example.com`,
        student_number: undefined,
        school: undefined,
      };

      return {
        id: session.id,
        student_id: session.student_id,
        student_name: studentInfo.name,
        student_email: studentInfo.email,
        student_number: studentInfo.student_number,
        student_school: studentInfo.school,
        submitted_at: session.submitted_at,
        used_clarifications: session.used_clarifications,
        created_at: session.created_at,
        status:
          session.status ||
          (session.submitted_at ? "submitted" : "in_progress"),
        is_active: session.is_active ?? true,
        last_heartbeat_at: session.last_heartbeat_at,
        grading_progress: session.grading_progress || null,
        score: scoreBySession.get(session.id) ?? null,
        is_graded: scoreBySession.has(session.id),
      };
    });

    return successJson({
      exam: {
        id: exam.id,
        title: exam.title,
      },
      sessions: processedSessions,
      pagination: {
        page,
        pageSize,
        totalCount: totalCount ?? 0,
        totalPages: Math.ceil((totalCount ?? 0) / pageSize),
      },
    });
  } catch (error) {
    logError("Sessions GET handler error", error, {
      path: `/api/exam/sessions`,
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
