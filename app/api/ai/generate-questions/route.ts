export const maxDuration = 120;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import {
  generateCaseQuestionsSchema,
  validateRequest,
  aiMcqResponseSchema,
  aiTrueFalseResponseSchema,
} from "@/lib/validations";
import {
  buildCaseQuestionGenerationPrompt,
  buildObjectiveQuestionGenerationPrompt,
} from "@/lib/prompts";
import { getOpenAI, AI_MODEL_HEAVY, OpenAICallTelemetryError } from "@/lib/openai";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";

const MATERIALS_CHAR_LIMIT = 8000;
const GENERATION_TIMEOUT_MS = 60_000;

/** Generated question payload returned to the client. */
interface GeneratedQuestionDto {
  id: string;
  text: string;
  type: "essay" | "multiple-choice" | "true-false";
  options?: string[];
  correctOptionIndex?: number;
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    const role = (user.role) || "student";
    if (role !== "instructor") {
      return errorJson("FORBIDDEN", "교수자만 문제를 생성할 수 있습니다.", 403);
    }

    // Rate limit: expensive OpenAI call — 키를 분리해 다른 AI 호출과 독립 카운팅
    const rl = await checkRateLimitAsync(`bulk-generate:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    // Validate body
    const body = await request.json();
    const validation = validateRequest(generateCaseQuestionsSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const data = validation.data;
    const questionType = data.questionType ?? "case";
    const questionCount = data.questionCount ?? 2;

    // Forward mock headers when running against mock server (OPENAI_BASE_URL points to localhost)
    const mockHeaders: Record<string, string> = {};
    const isMockServer = process.env.OPENAI_BASE_URL?.includes("localhost");
    if (isMockServer) {
      const mockError = request.headers.get("x-mock-error");
      if (mockError) mockHeaders["x-mock-error"] = mockError;
    }
    const hasMockHeaders = Object.keys(mockHeaders).length > 0;

    // Combine materials text with char limit
    let materialsContext: string | undefined;
    if (data.generationMode !== "research-assignment" && data.materialsText && data.materialsText.length > 0) {
      const combined = data.materialsText
        .map((m) => `[${m.fileName}]\n${m.text}`)
        .join("\n\n---\n\n");
      materialsContext =
        combined.length > MATERIALS_CHAR_LIMIT
          ? combined.slice(0, MATERIALS_CHAR_LIMIT) + "\n...(이하 생략)"
          : combined;
    }

    // Build prompt — dispatch by questionType. Objective types (mcq / true-false)
    // reuse buildObjectiveQuestionGenerationPrompt; case stays the case builder.
    const isObjective = questionType === "mcq" || questionType === "true-false";
    const { system, user: userPrompt } = isObjective
      ? buildObjectiveQuestionGenerationPrompt({
          examTitle: data.examTitle,
          questionType: questionType === "mcq" ? "mcq" : "true-false",
          questionCount,
          topics: data.topics,
          customInstructions: data.customInstructions,
          materialsContext,
          language: data.language,
        })
      : buildCaseQuestionGenerationPrompt({
          examTitle: data.examTitle,
          difficulty: data.difficulty ?? "intermediate",
          questionCount,
          topics: data.topics,
          customInstructions: data.customInstructions,
          materialsContext,
          language: data.language,
          generationMode: data.generationMode,
        });

    const attemptGeneration = async (): Promise<unknown> => {
      const tracked = await callTrackedChatCompletion(
        () =>
          getOpenAI().chat.completions.create(
            {
              model: AI_MODEL_HEAVY,
              messages: [
                { role: "system", content: system },
                { role: "user", content: userPrompt },
              ],
              response_format: { type: "json_object" },
            },
            // 이슈 #118: 타임아웃·재시도는 SDK 요청 옵션이 소유한다.
            // 목 헤더가 있으면 결정론을 위해 재시도를 끈다.
            hasMockHeaders
              ? { headers: mockHeaders, maxRetries: 0, timeout: GENERATION_TIMEOUT_MS }
              : { maxRetries: 2, timeout: GENERATION_TIMEOUT_MS }
          ),
        {
          feature: "generate_questions",
          route: "/api/ai/generate-questions",
          model: AI_MODEL_HEAVY,
          userId: user.id,
          metadata: buildAiTextMetadata({
            inputText: [system, userPrompt],
            extra: {
              question_count: questionCount,
              question_type: questionType,
              difficulty: data.difficulty ?? "intermediate",
              has_materials: !!materialsContext,
              generation_mode: data.generationMode,
            },
          }),
        },
        {
          metadataBuilder: (result) =>
            buildAiTextMetadata({
              outputText:
                (result as { choices?: Array<{ message?: { content?: string | null } }> })
                  .choices?.[0]?.message?.content ?? null,
            }),
        }
      );
      const completion = tracked.data;

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from AI");
      }

      return JSON.parse(content);
    };

    // Try generation with 1 retry on parse failure (skip retry for mock errors)
    let parsedResponse: unknown;
    try {
      parsedResponse = await attemptGeneration();
    } catch (firstError) {
      // 이슈 #118: 재시도는 **파싱 실패**에만 준다. 전송 실패까지 여기서 다시
      // 시도하면 SDK 요청 옵션의 maxRetries 와 곱해져 최대 6회 전송된다.
      if (firstError instanceof OpenAICallTelemetryError) {
        const msg = firstError.message || "AI 응답 생성 실패";
        return errorJson("AI_GENERATION_FAILED", msg, 500);
      }
      if (hasMockHeaders) {
        const msg =
          firstError instanceof Error ? firstError.message : "AI 응답 생성 실패";
        return errorJson("AI_GENERATION_FAILED", msg, 500);
      }
      try {
        parsedResponse = await attemptGeneration();
      } catch {
        const msg =
          firstError instanceof Error ? firstError.message : "AI 응답 생성 실패";
        return errorJson("AI_GENERATION_FAILED", msg, 500);
      }
    }

    // ── Objective (mcq / true-false): strictly validate the AI output ──
    if (isObjective) {
      const schema =
        questionType === "mcq" ? aiMcqResponseSchema : aiTrueFalseResponseSchema;
      const result = schema.safeParse(parsedResponse);
      if (!result.success) {
        return errorJson(
          "AI_GENERATION_FAILED",
          "AI가 올바른 형식의 문제를 생성하지 못했습니다.",
          500
        );
      }
      const questions: GeneratedQuestionDto[] = result.data.questions.map((q) => ({
        id: crypto.randomUUID(),
        text: q.text,
        type: questionType === "mcq" ? "multiple-choice" : "true-false",
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
      }));
      return successJson({ questions });
    }

    // ── Case: existing essay-question shape ──
    const caseResponse = parsedResponse as {
      questions?: Array<{ text: string; type?: string }>;
    };
    if (!caseResponse.questions || !Array.isArray(caseResponse.questions)) {
      return errorJson(
        "AI_GENERATION_FAILED",
        "AI 응답 형식이 올바르지 않습니다.",
        500
      );
    }

    const questions: GeneratedQuestionDto[] = caseResponse.questions.map((q) => ({
      id: crypto.randomUUID(),
      text: q.text,
      type: "essay" as const,
    }));

    return successJson({ questions });
  } catch (error) {
    logError("Question generation failed", error, { path: "/api/ai/generate-questions" });
    return errorJson("INTERNAL_ERROR", "문제 생성 중 오류가 발생했습니다.", 500);
  }
}
