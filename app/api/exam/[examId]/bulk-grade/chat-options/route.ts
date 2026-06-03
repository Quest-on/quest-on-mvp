import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { requireBulkGradeAccess } from "@/lib/bulk-grade-access";
import { bulkGradeChatOptionsSchema, validateRequest } from "@/lib/validations";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import { getOpenAI, AI_MODEL_BULK_GRADING_WORKER } from "@/lib/openai";
import { buildQuickReplyOptionsPrompt } from "@/lib/prompts";
import { getSupabaseServer } from "@/lib/supabase-server";

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
      `bulk-grade-chat-options:${user?.id ?? "anon"}:${examId}`,
      RATE_LIMITS.ai,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const access = await requireBulkGradeAccess(examId, user, {
      requireClosed: true,
    });
    if (!access.ok) return access.response;

    const body = await request.json();
    const validation = validateRequest(bulkGradeChatOptionsSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const { questionText, gradingSessionId } = validation.data;

    // Ownership: verify the gradingSessionId belongs to this exam and instructor
    const supabase = getSupabaseServer();
    const { data: sessionRow, error: sessionError } = await supabase
      .from("exam_grading_sessions")
      .select("id")
      .eq("id", gradingSessionId)
      .eq("exam_id", examId)
      .eq("instructor_id", access.ctx.user.id)
      .maybeSingle();

    if (sessionError) {
      logError("bulk-grade-chat-options: grading session query failed", sessionError, {
        path: `/api/exam/${examId}/bulk-grade/chat-options`,
      });
      return successJson({ options: [] });
    }

    if (!sessionRow) {
      return errorJson("NOT_FOUND", "Grading session not found", 404);
    }

    // Call AI to generate quick reply options
    try {
      const systemPrompt = buildQuickReplyOptionsPrompt(questionText);

      const tracked = await callTrackedChatCompletion(
        () =>
          getOpenAI().chat.completions.create({
            model: AI_MODEL_BULK_GRADING_WORKER,
            messages: [{ role: "system", content: systemPrompt }],
            max_completion_tokens: 150,
            response_format: { type: "json_object" },
          }),
        {
          feature: "bulk_grading_chat",
          route: `/api/exam/${examId}/bulk-grade/chat-options`,
          model: AI_MODEL_BULK_GRADING_WORKER,
          userId: access.ctx.user.id,
          examId,
          metadata: buildAiTextMetadata({ inputText: [systemPrompt] }),
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

      const rawContent = tracked.data.choices[0]?.message?.content?.trim() ?? "";

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        return successJson({ options: [] });
      }

      const rawOptions =
        parsed !== null &&
        typeof parsed === "object" &&
        "options" in parsed &&
        Array.isArray((parsed as { options: unknown }).options)
          ? (parsed as { options: unknown[] }).options
          : null;

      if (!rawOptions) {
        return successJson({ options: [] });
      }

      const options = rawOptions
        .filter((o) => typeof o === "string" && (o as string).trim().length > 0)
        .map((o) => (o as string).trim());

      if (options.length < 2 || options.length > 4) {
        return successJson({ options: [] });
      }

      return successJson({ options });
    } catch (aiError) {
      logError("bulk-grade-chat-options: AI call failed", aiError, {
        path: `/api/exam/${examId}/bulk-grade/chat-options`,
      });
      return successJson({ options: [] });
    }
  } catch (error) {
    logError("bulk-grade-chat-options: handler error", error, {
      path: "/api/exam/bulk-grade/chat-options",
    });
    return successJson({ options: [] });
  }
}
