// Node.js Runtime 사용 (4MB → 25MB 업로드 한도 증가)
export const runtime = "nodejs";

// Route configuration
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { buildInstructorChatSystemPrompt } from "@/lib/prompts";
import { handleCorsPreFlight } from "@/lib/cors";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest, instructorChatRequestSchema } from "@/lib/validations";
import { successJson, errorJson } from "@/lib/api-response";
import { extractResponseText } from "@/lib/parse-openai-response";
import {
  buildAiTextMetadata,
  callTrackedResponse,
} from "@/lib/ai-tracking";

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request);
}

export async function GET() {
  return NextResponse.json(
    { ok: true, route: "/api/instructor/chat", methods: ["POST", "OPTIONS"] },
    { status: 200, headers: { Allow: "POST, OPTIONS" } },
  );
}

// 공통 Completion 함수 - Responses API 사용
async function getAIResponse(
  systemPrompt: string,
  userMessage: string,
  previousResponseId: string | null = null,
  tracking?: {
    userId?: string;
    sessionId?: string;
  }
): Promise<{ response: string; responseId: string }> {
  try {
    const { data: response } = await callTrackedResponse(
      () =>
        getOpenAI().responses.create({
          model: AI_MODEL,
          instructions: systemPrompt,
          input: userMessage,
          previous_response_id: previousResponseId || undefined,
          store: true,
        }),
      {
        feature: "instructor_chat",
        route: "/api/instructor/chat",
        model: AI_MODEL,
        userId: tracking?.userId,
        sessionId: tracking?.sessionId,
        metadata: buildAiTextMetadata({
          inputText: [systemPrompt, userMessage],
          extra: previousResponseId
            ? { previous_response_id: previousResponseId }
            : undefined,
        }),
      },
      {
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText: extractResponseText(
              ((result as { output?: unknown[] }).output as
                | Parameters<typeof extractResponseText>[0]
                | undefined) ?? []
            ),
          }),
      }
    );

    // output 배열에서 텍스트 추출
    const responseText = extractResponseText(response.output);

    if (!responseText || responseText.trim().length === 0) {
      return {
        response:
          "죄송합니다. 질문을 처리하는 중에 문제가 발생했습니다. 다시 시도해주세요.",
        responseId: response.id,
      };
    }

    return {
      response: responseText,
      responseId: response.id,
    };
  } catch (openaiError) {
    throw new Error(
      `OpenAI Responses API failed: ${(openaiError as Error).message}`,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    // Rate limiting
    const rl = await checkRateLimitAsync(`instructor-chat:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const body = await request.json();

    // Input validation
    const validation = validateRequest(instructorChatRequestSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error!, 400);
    }

    const { message, sessionId, context, scopeDescription } = validation.data;

    // 교수용 프롬프트 생성
    const systemPrompt = buildInstructorChatSystemPrompt({
      preferences: null,
      context,
      scopeDescription,
    });

    // 이전 응답 ID는 사용하지 않음 (교수용은 대화 히스토리 관리가 다를 수 있음)
    const previousResponseId = null;

    const { response: aiResponse } = await getAIResponse(
      systemPrompt,
      message,
      previousResponseId,
      {
        userId: user.id,
        sessionId,
      }
    );

    return successJson({
      response: aiResponse,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return errorJson(
      "INTERNAL_ERROR",
      "죄송합니다. 응답을 생성하는 중에 오류가 발생했습니다. 다시 시도해주세요.",
      500,
      process.env.NODE_ENV === "development" ? errorMessage : undefined
    );
  }
}
