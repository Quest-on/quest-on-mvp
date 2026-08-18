import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logWarn } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const supabase = getSupabaseServer();

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(`session:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    // Get session data with related submissions and messages
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select(
        `
        *,
        exams (
          id,
          title,
          code,
          instructor_id
        ),
        submissions (
          *,
          compressed_answer_data,
          compression_metadata
        ),
        messages (
          *,
          compressed_content,
          compression_metadata
        )
      `,
      )
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    // Check if user is authorized to view this session
    const userRole = user.role;
    const isInstructor = userRole === "instructor";
    const isStudentOwner = session.student_id === user.id;

    if (!isInstructor && !isStudentOwner) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // If instructor, check if they own the exam
    if (isInstructor && session.exams.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Decompress session data if available
    let decompressedSessionData = null;
    if (
      session.compressed_session_data &&
      typeof session.compressed_session_data === "string"
    ) {
      try {
        decompressedSessionData = decompressData(
          session.compressed_session_data,
        );
      } catch {
        logWarn("Decompression failed for session data", {
          payload: { sessionId, field: "compressed_session_data" },
        });
      }
    }

    // Decompress submissions data
    const decompressedSubmissions =
      session.submissions?.map((submission: Record<string, unknown>) => {
        let decompressedAnswerData = null;

        if (
          submission.compressed_answer_data &&
          typeof submission.compressed_answer_data === "string"
        ) {
          try {
            decompressedAnswerData = decompressData(
              submission.compressed_answer_data,
            );
          } catch {
            logWarn("Decompression failed for submission answer data", {
              payload: { sessionId, field: "compressed_answer_data", submissionId: submission.id },
            });
          }
        }

        return {
          ...submission,
          decompressed: {
            answerData: decompressedAnswerData,
          },
        };
      }) || [];

    // Decompress messages data
    const decompressedMessages =
      session.messages?.map((message: Record<string, unknown>) => {
        let decompressedContent = null;

        if (
          message.compressed_content &&
          typeof message.compressed_content === "string"
        ) {
          try {
            decompressedContent = decompressData(message.compressed_content);
          } catch {
            logWarn("Decompression failed for message content", {
              payload: { sessionId, field: "compressed_content", messageId: message.id },
            });
          }
        }

        return {
          ...message,
          decompressed: {
            content: decompressedContent,
          },
        };
      }) || [];

    // Calculate compression stats
    const compressionStats = {
      session: session.compression_metadata || null,
      submissions:
        session.submissions
          ?.map((s: Record<string, unknown>) => s.compression_metadata)
          .filter(Boolean) || [],
      messages:
        session.messages
          ?.map((m: Record<string, unknown>) => m.compression_metadata)
          .filter(Boolean) || [],
      totalOriginalSize: 0,
      totalCompressedSize: 0,
    };

    // Calculate total compression stats
    if (session.compression_metadata) {
      compressionStats.totalOriginalSize +=
        session.compression_metadata.originalSize || 0;
      compressionStats.totalCompressedSize +=
        session.compression_metadata.compressedSize || 0;
    }

    compressionStats.submissions.forEach((meta: Record<string, unknown>) => {
      const metaObj = meta as Record<string, unknown>;
      compressionStats.totalOriginalSize +=
        (metaObj.originalSize as number) || 0;
      compressionStats.totalCompressedSize +=
        (metaObj.compressedSize as number) || 0;
    });

    compressionStats.messages.forEach((meta: Record<string, unknown>) => {
      const metaObj = meta as Record<string, unknown>;
      compressionStats.totalOriginalSize +=
        (metaObj.originalSize as number) || 0;
      compressionStats.totalCompressedSize +=
        (metaObj.compressedSize as number) || 0;
    });

    compressionStats.totalOriginalSize = compressionStats.totalOriginalSize;
    compressionStats.totalCompressedSize = compressionStats.totalCompressedSize;

    return successJson({
      session: {
        id: session.id,
        exam_id: session.exam_id,
        student_id: session.student_id,
        submitted_at: session.submitted_at,
        used_clarifications: session.used_clarifications,
        created_at: session.created_at,
        // Decompressed session data
        decompressed: decompressedSessionData,
        // Compression metadata
        compression_metadata: session.compression_metadata,
        // Exam info
        exam: session.exams,
      },
      submissions: decompressedSubmissions,
      messages: decompressedMessages,
      compressionStats,
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
