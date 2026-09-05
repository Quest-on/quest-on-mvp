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
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const searchParams = request.nextUrl.searchParams;
    const since = searchParams.get("since"); // ISO timestamp

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

    // Get session to verify it exists and get exam_id
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, student_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    // Get exam to verify instructor owns it
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, instructor_id")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get student profile
    const { data: studentProfile } = await supabase
      .from("student_profiles")
      .select("name, student_number, school")
      .eq("student_id", session.student_id)
      .single();

    // Get student info from Clerk (batch call for consistency)
    const clerkUserMap = await batchGetUserInfo([session.student_id]);
    const studentName = clerkUserMap.get(session.student_id)?.name ?? `Student ${session.student_id.slice(0, 8)}`;

    // Build query for messages
    let messagesQuery = supabase
      .from("messages")
      .select("id, q_idx, role, content, compressed_content, created_at")
      .eq("session_id", sessionId)
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

    // Process messages
    const processedMessages = (messages || []).map((message) => {
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
        session_id: sessionId,
        q_idx: message.q_idx,
        role: message.role, // Include role: "user" or "ai"
        content: content.substring(0, 500),
        created_at: message.created_at,
        student: {
          id: session.student_id,
          name: studentProfile?.name || studentName,
          email: "",
          student_number: studentProfile?.student_number,
          school: studentProfile?.school,
        },
      };
    });

    return successJson({
      messages: processedMessages,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
