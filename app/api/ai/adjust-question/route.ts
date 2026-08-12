export const maxDuration = 60;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  adjustCaseQuestionSchema,
  aiMcqResponseSchema,
  aiTrueFalseResponseSchema,
  validateRequest,
} from "@/lib/validations";
import {
  buildCaseQuestionAdjustmentPrompt,
  buildObjectiveQuestionGenerationPrompt,
} from "@/lib/prompts";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import { getCachedAiResponse, setCachedAiResponse } from "@/lib/ai-cache";

/**
 * Shared response shape for this route.
 * - essay: { questionText, explanation }  (backward compatible)
 * - multiple-choice / true-false: additionally { options, correctOptionIndex }
 */
type AdjustQuestionResult = {
  questionText: string;
  explanation: string;
  options?: string[];
  correctOptionIndex?: number;
};

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    const role = (user.role) || "student";
    if (role !== "instructor") {
      return errorJson("FORBIDDEN", "교수자만 문제를 수정할 수 있습니다.", 403);
    }

    // 2. Rate limiting
    const rl = await checkRateLimitAsync(`adjust-question:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // 3. Validate body
    const body = await request.json();
    const validation = validateRequest(adjustCaseQuestionSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const data = validation.data;
    const isObjective =
      data.questionType === "multiple-choice" || data.questionType === "true-false";

    // 캐시 확인: 동일 입력에 대한 이전 결과 재사용.
    // questionType / currentOptions / currentCorrectOptionIndex 를 키에 포함해야
    // 동일 questionText 의 essay 수정과 객관식 생성 결과가 충돌하지 않는다.
    const cacheInput = {
      questionText: data.questionText,
      instruction: data.instruction,
      examTitle: data.examTitle,
      language: data.language,
      generationMode: data.generationMode,
      questionType: data.questionType,
      currentOptions: data.currentOptions,
      currentCorrectOptionIndex: data.currentCorrectOptionIndex,
    };
    const cached = await getCachedAiResponse("adjust-question", cacheInput);
    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        if (parsedCache.questionText) {
          return successJson(parsedCache);
        }
      } catch { /* corrupted — proceed */ }
    }

    // 4. Build prompt — branch on questionType.
    const { system, user: userPrompt } = isObjective
      ? buildObjectiveQuestionGenerationPrompt({
      preferences: null,
          examTitle: data.examTitle ?? "",
          questionType: data.questionType === "multiple-choice" ? "mcq" : "true-false",
          questionCount: 1,
          language: data.language,
          instruction: data.instruction,
          currentQuestion: {
            text: data.questionText,
            options: data.currentOptions,
            correctOptionIndex: data.currentCorrectOptionIndex,
          },
        })
      : buildCaseQuestionAdjustmentPrompt({
      preferences: null,
          currentQuestionText: data.questionText,
          instruction: data.instruction,
          conversationHistory: data.conversationHistory,
          examTitle: data.examTitle,
          language: data.language,
          generationMode: data.generationMode,
        });

    // 5. Call OpenAI (tracked)
    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      {
        feature: "adjust_question",
        route: "/api/ai/adjust-question",
        model: AI_MODEL,
        userId: user.id,
        metadata: buildAiTextMetadata({
          inputText: [system, userPrompt],
          extra: {
            conversation_turns: data.conversationHistory?.length ?? 0,
            generation_mode: data.generationMode,
            question_type: data.questionType,
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
      return errorJson("AI_GENERATION_FAILED", "AI 응답이 비어있습니다.", 500);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return errorJson(
        "AI_GENERATION_FAILED",
        "AI 응답을 파싱할 수 없습니다.",
        500
      );
    }

    let result: AdjustQuestionResult;

    if (isObjective) {
      // Objective branch — validate strictly with the existing AI response schemas.
      const schema =
        data.questionType === "multiple-choice"
          ? aiMcqResponseSchema
          : aiTrueFalseResponseSchema;
      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        return errorJson(
          "AI_GENERATION_FAILED",
          "AI 응답 형식이 올바르지 않습니다.",
          500
        );
      }
      const q = validated.data.questions[0];
      result = {
        questionText: q.text,
        explanation: q.rationale ?? "",
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
      };
    } else {
      // Essay branch — unchanged behavior.
      const parsedEssay = parsed as { questionText?: string; explanation?: string };
      if (!parsedEssay.questionText) {
        return errorJson(
          "AI_GENERATION_FAILED",
          "AI 응답 형식이 올바르지 않습니다.",
          500
        );
      }
      result = {
        questionText: parsedEssay.questionText,
        explanation: parsedEssay.explanation || "",
      };
    }

    // 캐시에 저장 (30분 TTL)
    setCachedAiResponse("adjust-question", cacheInput, JSON.stringify(result)).catch(() => {});

    return successJson(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "문제 수정 중 오류가 발생했습니다.";
    return errorJson("INTERNAL_ERROR", message, 500);
  }
}
