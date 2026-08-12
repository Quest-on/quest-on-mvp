export const maxDuration = 60;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { decompressData } from "@/lib/compression";
import { buildCaseGradingChatSystemPrompt } from "@/lib/prompts";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import {
  caseGradeChatPostSchema,
  validateRequest,
} from "@/lib/validations";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import {
  assistantMessageIdFromClientMessageId,
  isUniqueViolation,
} from "@/lib/chat-idempotency";
import {
  questionPromptByQIdx,
  requireCaseGradeAccess,
} from "@/lib/case-grade-access";
import { isAssignmentType } from "@/lib/grading-helpers";
import { stripEmoji } from "@/lib/sanitize";
import { withInputOrigin } from "@/lib/input-origin";

type GradingChatRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

const IDEMPOTENT_RESPONSE_WAIT_MS = 250;
const IDEMPOTENT_RESPONSE_ATTEMPTS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCaseAssistantMessage(
  supabase: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>,
  sessionId: string,
  qIdx: number,
  clientMessageId: string,
): Promise<Pick<GradingChatRow, "id" | "role" | "content"> | null> {
  for (let attempt = 0; attempt < IDEMPOTENT_RESPONSE_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase
      .from("grading_chats")
      .select("id, role, content")
      .eq("session_id", sessionId)
      .eq("q_idx", qIdx)
      .eq("role", "assistant")
      .eq("client_message_id", clientMessageId)
      .maybeSingle();

    if (!error && data) return data as Pick<GradingChatRow, "id" | "role" | "content">;
    await sleep(IDEMPOTENT_RESPONSE_WAIT_MS);
  }

  return null;
}

function parseQIdx(searchParams: URLSearchParams): number | null {
  const raw = searchParams.get("qIdx");
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

async function loadStudentAnswer(
  supabase: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>,
  sessionId: string,
  qIdx: number,
): Promise<string> {
  const { data: submission } = await supabase
    .from("submissions")
    .select("answer, compressed_answer_data")
    .eq("session_id", sessionId)
    .eq("q_idx", qIdx)
    .maybeSingle();

  if (!submission) return "";

  if (
    submission.compressed_answer_data &&
    typeof submission.compressed_answer_data === "string"
  ) {
    try {
      const decompressed = decompressData(submission.compressed_answer_data);
      if (typeof decompressed === "string") return decompressed;
      if (decompressed && typeof decompressed === "object") {
        const obj = decompressed as Record<string, unknown>;
        if (typeof obj.text === "string") return obj.text;
        if (typeof obj.content === "string") return obj.content;
      }
    } catch (error) {
      logError("case-grade chat: decompress answer failed", error, {
        path: "/api/session/case-grade/chat",
        additionalData: { sessionId, qIdx },
      });
    }
  }

  return typeof submission.answer === "string" ? submission.answer : "";
}

async function loadStudentChatSummary(
  supabase: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>,
  sessionId: string,
  qIdx: number,
): Promise<string> {
  const { data: messages, error } = await supabase
    .from("messages")
    .select("role, content, compressed_content, created_at")
    .eq("session_id", sessionId)
    .eq("q_idx", qIdx)
    .order("created_at", { ascending: true });

  if (error || !messages?.length) return "";

  return messages
    .map((msg) => {
      let content = msg.content as string | null;
      if (msg.compressed_content && typeof msg.compressed_content === "string") {
        try {
          const decompressed = decompressData(msg.compressed_content);
          content = typeof decompressed === "string" ? decompressed : content;
        } catch {
          // keep plain content
        }
      }
      const roleLabel =
        msg.role === "user" ? "Student" : msg.role === "ai" ? "AI" : String(msg.role);
      return `${roleLabel}: ${content ?? ""}`;
    })
    .join("\n\n");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const qIdx = parseQIdx(request.nextUrl.searchParams);
    if (qIdx === null) {
      return errorJson("VALIDATION_ERROR", "qIdx query parameter is required", 400);
    }

    const user = await currentUser();
    const access = await requireCaseGradeAccess(sessionId, user, qIdx, {
      requireGradable: true,
    });
    if (!access.ok) return access.response;

    const { data: rows, error } = await access.ctx.supabase
      .from("grading_chats")
      .select("id, role, content, created_at")
      .eq("session_id", sessionId)
      .eq("q_idx", qIdx)
      .order("created_at", { ascending: true });

    if (error) {
      logError("case-grade chat GET failed", error, {
        path: `/api/session/${sessionId}/case-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to load grading chat", 500);
    }

    const messages = ((rows || []) as GradingChatRow[]).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      created_at: row.created_at,
    }));

    return successJson({ messages });
  } catch (error) {
    logError("case-grade chat GET handler error", error, {
      path: "/api/session/case-grade/chat",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    const body = await request.json();
    const validation = validateRequest(caseGradeChatPostSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    // inputOrigin 은 검증 전 unknown 이다. withInputOrigin 만이 어휘를 판정한다.
    const { qIdx, message, clientMessageId, inputOrigin } = validation.data;

    const access = await requireCaseGradeAccess(sessionId, user, qIdx, {
      requireGradable: true,
    });
    if (!access.ok) return access.response;

    const rl = await checkRateLimitAsync(
      `case-grading-chat:${access.ctx.user.id}`,
      RATE_LIMITS.ai,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const { supabase, session, exam } = access.ctx;

    // input_origin: 교수가 직접 쓴 문장인지 여부를 행에 남긴다. 어휘 밖 값·누락은 NULL.
    const userMessagePayload: Record<string, unknown> = withInputOrigin(
      {
        session_id: sessionId,
        q_idx: qIdx,
        role: "user",
        content: message,
        created_by: access.ctx.user.id,
        client_message_id: clientMessageId,
      },
      inputOrigin,
    );

    const { error: insertUserError } = await supabase
      .from("grading_chats")
      .insert(userMessagePayload);

    if (insertUserError) {
      if (isUniqueViolation(insertUserError)) {
        const existingAssistant = await waitForCaseAssistantMessage(
          supabase,
          sessionId,
          qIdx,
          clientMessageId,
        );

        if (existingAssistant) {
          return successJson({ assistantMessage: existingAssistant });
        }
        return errorJson("CONFLICT", "Message is already being processed", 409);
      } else {
        logError("case-grade chat: save user message failed", insertUserError, {
          path: `/api/session/${sessionId}/case-grade/chat`,
        });
        return errorJson("INTERNAL_ERROR", "Failed to save message", 500);
      }
    }

    const [historyResult, studentAnswer, studentChatSummary] = await Promise.all([
      supabase
        .from("grading_chats")
        .select("role, content")
        .eq("session_id", sessionId)
        .eq("q_idx", qIdx)
        .order("created_at", { ascending: true }),
      isAssignmentType(exam.type)
        ? Promise.resolve(
            typeof session.final_answer === "string" ? session.final_answer : "",
          )
        : loadStudentAnswer(supabase, sessionId, qIdx),
      loadStudentChatSummary(supabase, sessionId, qIdx),
    ]);

    if (historyResult.error) {
      return errorJson("INTERNAL_ERROR", "Failed to load chat history", 500);
    }

    const examLanguage: "ko" | "en" = exam.language === "en" ? "en" : "ko";
    const questionPrompt = questionPromptByQIdx(exam.questions, qIdx);

    const systemPrompt = buildCaseGradingChatSystemPrompt({
      preferences: null,
      questionPrompt,
      studentAnswer,
      studentChatSummary,
      language: examLanguage,
      isAssignment: isAssignmentType(exam.type),
    });

    const openAiMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: systemPrompt }];

    for (const row of historyResult.data || []) {
      if (row.role === "user" || row.role === "assistant") {
        openAiMessages.push({
          role: row.role,
          content: row.content as string,
        });
      }
    }

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL,
          messages: openAiMessages,
          max_completion_tokens: 700,
        }),
      {
        feature: "case_grading_chat",
        route: `/api/session/${sessionId}/case-grade/chat`,
        model: AI_MODEL,
        userId: access.ctx.user.id,
        examId: session.exam_id,
        sessionId,
        qIdx,
        metadata: buildAiTextMetadata({
          inputText: openAiMessages.map((m) => m.content),
          extra: { q_idx: qIdx },
        }),
      },
      {
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (
                result as {
                  choices?: Array<{ message?: { content?: string | null } }>;
                }
              ).choices?.[0]?.message?.content ?? null,
          }),
      },
    );

    const assistantContent = stripEmoji(
      tracked.data.choices[0]?.message?.content?.trim() || "",
    ).trim();

    if (!assistantContent) {
      return errorJson("INTERNAL_ERROR", "Failed to generate AI response", 500);
    }

    const assistantPayload: Record<string, unknown> = {
      session_id: sessionId,
      q_idx: qIdx,
      role: "assistant",
      content: assistantContent,
      created_by: access.ctx.user.id,
      client_message_id: clientMessageId,
    };
    assistantPayload.id = assistantMessageIdFromClientMessageId(
      `case-grade-chat:${sessionId}:${qIdx}`,
      clientMessageId,
    );

    const { data: assistantRow, error: insertAssistantError } = await supabase
      .from("grading_chats")
      .insert(assistantPayload)
      .select("id, role, content")
      .single();

    if (insertAssistantError || !assistantRow) {
      if (isUniqueViolation(insertAssistantError)) {
        const { data: existingAssistant, error: existingAssistantError } = await supabase
          .from("grading_chats")
          .select("id, role, content")
          .eq("id", assistantPayload.id as string)
          .maybeSingle();

        if (!existingAssistantError && existingAssistant) {
          return successJson({ assistantMessage: existingAssistant });
        }
      }
      logError("case-grade chat: save assistant message failed", insertAssistantError, {
        path: `/api/session/${sessionId}/case-grade/chat`,
      });
      return errorJson("INTERNAL_ERROR", "Failed to save assistant message", 500);
    }

    return successJson({
      assistantMessage: {
        id: assistantRow.id,
        role: assistantRow.role,
        content: assistantRow.content,
      },
    });
  } catch (error) {
    logError("case-grade chat POST handler error", error, {
      path: "/api/session/case-grade/chat",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
