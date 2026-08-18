import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { batchGetUserInfo } from "@/lib/app-users";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// Initialize Supabase client
const supabase = getSupabaseServer();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const searchParams = request.nextUrl.searchParams;
    const since = searchParams.get("since"); // ISO timestamp to get messages after this time

    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const rl = await checkRateLimitAsync(`live-messages:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // Get exam to verify instructor owns it
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, instructor_id")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get all active sessions for this exam (not submitted)
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, student_id, created_at")
      .eq("exam_id", examId)
      .is("submitted_at", null);

    if (sessionsError) {
      throw sessionsError;
    }

    if (!sessions || sessions.length === 0) {
      return successJson({ messages: [], sessions: [] });
    }

    // Get session IDs
    const sessionIds = sessions.map((s) => s.id);

    // Build query for messages
    let messagesQuery = supabase
      .from("messages")
      .select(
        `
        id,
        session_id,
        q_idx,
        role,
        content,
        compressed_content,
        compression_metadata,
        created_at
      `
      )
      .in("session_id", sessionIds)
      .in("role", ["user", "ai"]) // Include both user questions and AI responses
      .order("created_at", { ascending: true })
      .limit(100); // Limit to latest 100 messages (increased to include pairs)

    // If since parameter is provided, only get messages after that time
    if (since) {
      messagesQuery = messagesQuery.gt("created_at", since);
    }

    const { data: messages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      throw messagesError;
    }

    // Get unique student IDs
    const uniqueStudentIds = [...new Set(sessions.map((s) => s.student_id))];
    
    // Fetch student profiles from database
    const { data: studentProfiles } = await supabase
      .from("student_profiles")
      .select("student_id, name, student_number, school")
      .in("student_id", uniqueStudentIds);
    
    // Create a map of student profiles
    const studentProfileMap = new Map<string, { name: string; student_number: string; school: string }>();
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

    const studentInfoMap = new Map<string, { name: string; email: string; student_number?: string; school?: string }>();
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

    // Process messages with student info
    const processedMessages = (messages || []).map((message) => {
      // Find session to get student_id
      const session = sessions.find((s) => s.id === message.session_id);
      const studentId = session?.student_id || "";
      const studentInfo = studentInfoMap.get(studentId) || {
        name: `Student ${studentId.slice(0, 8)}`,
        email: `${studentId}@example.com`,
      };

      // Decompress content if needed
      let content = message.content;
      if (message.compressed_content && typeof message.compressed_content === "string") {
        try {
          const decompressed = decompressData(message.compressed_content);
          content = typeof decompressed === "string" ? decompressed : content;
        } catch {
          // Use original content on decompression failure
        }
      }

      return {
        id: message.id,
        session_id: message.session_id,
        q_idx: message.q_idx,
        role: message.role, // Include role: "user" or "ai"
        content: content.substring(0, 500), // Truncate for preview
        created_at: message.created_at,
        student: {
          id: studentId,
          name: studentInfo.name,
          email: studentInfo.email,
          student_number: studentInfo.student_number,
          school: studentInfo.school,
        },
      };
    });

    // Sort by created_at ascending (oldest first)
    processedMessages.sort((a, b) => {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return successJson({
      messages: processedMessages,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
