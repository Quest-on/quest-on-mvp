export const maxDuration = 120;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { errorJson } from "@/lib/api-response";
import {
  generateCaseQuestionsSchema,
  validateRequest,
  aiMcqResponseSchema,
  aiTrueFalseResponseSchema,
} from "@/lib/validations";
import {
  buildSingleCaseQuestionPrompt,
  buildObjectiveQuestionGenerationPrompt,
} from "@/lib/prompts";
import { getOpenAI, AI_MODEL_HEAVY, OpenAICallTelemetryError } from "@/lib/openai";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";

const MATERIALS_CHAR_LIMIT = 8000;
const MAX_ATTEMPTS = 2; // 1 retry on parse failure

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

interface ParsedQuestionResponse {
  questions: Array<{
    text: string;
    type: string;
  }>;
}

/** Question payload emitted on the SSE `question` event. */
interface StreamedQuestion {
  id: string;
  text: string;
  type: "essay" | "multiple-choice" | "true-false";
  options?: string[];
  correctOptionIndex?: number;
}

/** Single OpenAI generation call with 1 retry on parse failure. */
async function runGeneration(
  system: string,
  userPrompt: string,
  tracking: {
    userId: string;
    questionIndex: number;
    totalQuestions: number;
  }
): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
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
            // 클라이언트 기본 maxRetries 가 0 이므로 여기서 명시해야 재시도가 산다.
            { timeout: 120_000, maxRetries: 2 }
          ),
        {
          feature: "generate_questions_stream",
          route: "/api/ai/generate-questions-stream",
          model: AI_MODEL_HEAVY,
          userId: tracking.userId,
          metadata: buildAiTextMetadata({
            inputText: [system, userPrompt],
            extra: {
              question_index: tracking.questionIndex,
              total_questions: tracking.totalQuestions,
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
      if (!content) throw new Error("Empty response from AI");

      return JSON.parse(content);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // 이슈 #118: 이 루프는 **파싱/의미 실패**만 다시 시도한다.
      // 전송 실패까지 여기서 잡으면 SDK 요청 옵션의 재시도(maxRetries)와 곱해져
      // 한 번의 논리적 호출이 최대 6회 전송된다 — 이 이슈가 없앤 바로 그 결함이다.
      if (err instanceof OpenAICallTelemetryError) throw lastError;
      if (attempt < MAX_ATTEMPTS - 1) continue;
    }
  }

  throw lastError!;
}

/** Single case-question generation with 1 retry on parse failure. */
async function generateSingleQuestion(
  system: string,
  userPrompt: string,
  tracking: {
    userId: string;
    questionIndex: number;
    totalQuestions: number;
  }
): Promise<ParsedQuestionResponse> {
  return (await runGeneration(system, userPrompt, tracking)) as ParsedQuestionResponse;
}

export async function POST(request: NextRequest) {
  // ── Auth & validation (before streaming starts) ──
  const user = await currentUser();
  if (!user) {
    return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  }

  const role = (user.role) || "student";
  if (role !== "instructor") {
    return errorJson("FORBIDDEN", "교수자만 문제를 생성할 수 있습니다.", 403);
  }

  // Rate limit: expensive OpenAI call
  const rl = await checkRateLimitAsync(`ai:generate-questions-stream:${user.id}`, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
  }

  const body = await request.json();
  const validation = validateRequest(generateCaseQuestionsSchema, body);
  if (!validation.success) {
    return errorJson("VALIDATION_ERROR", validation.error, 400);
  }

  const data = validation.data;
  const questionCount = data.questionCount ?? 2;
  const difficulty = data.difficulty ?? "intermediate";
  const questionType = data.questionType ?? "case";
  const isObjective = questionType === "mcq" || questionType === "true-false";

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

  // ── SSE stream ──
  const encoder = new TextEncoder();
  let isCancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, payload: unknown) => {
        if (isCancelled) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, payload)));
        } catch {
          isCancelled = true;
        }
      };

      try {
        enqueue("progress", {
          stage: "started",
          current: 0,
          total: questionCount,
        });

        enqueue("progress", {
          stage: "generating",
          current: 0,
          total: questionCount,
        });

        let successCount = 0;

        if (isObjective) {
          // ── 객관식/OX: 단일 호출로 전체 문항 생성 후 하나씩 emit ──
          try {
            const { system, user: userPrompt } =
              buildObjectiveQuestionGenerationPrompt({
                examTitle: data.examTitle,
                questionType: questionType === "mcq" ? "mcq" : "true-false",
                questionCount,
                topics: data.topics,
                customInstructions: data.customInstructions,
                materialsContext,
                language: data.language,
              });

            const raw = await runGeneration(system, userPrompt, {
              userId: user.id,
              questionIndex: 0,
              totalQuestions: questionCount,
            });

            const schema =
              questionType === "mcq"
                ? aiMcqResponseSchema
                : aiTrueFalseResponseSchema;
            const parsed = schema.safeParse(raw);
            if (!parsed.success) {
              throw new Error("AI가 올바른 형식의 문제를 생성하지 못했습니다.");
            }

            parsed.data.questions.slice(0, questionCount).forEach((q, i) => {
              if (isCancelled) return;
              successCount++;
              const question: StreamedQuestion = {
                id: crypto.randomUUID(),
                text: q.text,
                type:
                  questionType === "mcq" ? "multiple-choice" : "true-false",
                options: q.options,
                correctOptionIndex: q.correctOptionIndex,
              };
              enqueue("question", { question, index: i });
              enqueue("progress", {
                stage: "generating",
                current: successCount,
                total: questionCount,
              });
            });
          } catch (err) {
            if (!isCancelled) {
              const message =
                err instanceof Error ? err.message : "문제 생성 실패";
              enqueue("error", { message, index: 0, partial: true });
            }
          }
        } else {
          // ── 사례형: 문항별 병렬 생성, 완료 순서대로 stream ──
          const prompts = Array.from({ length: questionCount }, (_, i) =>
            buildSingleCaseQuestionPrompt({
              examTitle: data.examTitle,
              difficulty,
              questionIndex: i,
              totalQuestions: questionCount,
              topics: data.topics,
              customInstructions: data.customInstructions,
              materialsContext,
              language: data.language,
              generationMode: data.generationMode,
            })
          );

          let completedCount = 0;

          const settled = prompts.map((prompt, i) =>
            generateSingleQuestion(prompt.system, prompt.user, {
              userId: user.id,
              questionIndex: i,
              totalQuestions: questionCount,
            })
              .then((parsed) => {
                if (isCancelled) return;
                completedCount++;
                successCount++;

                const q = parsed.questions?.[0];
                if (q) {
                  const question: StreamedQuestion = {
                    id: crypto.randomUUID(),
                    text: q.text,
                    type: "essay",
                  };
                  enqueue("question", { question, index: i });
                }

                enqueue("progress", {
                  stage: "generating",
                  current: completedCount,
                  total: questionCount,
                });
              })
              .catch((err) => {
                if (isCancelled) return;
                completedCount++;
                const message =
                  err instanceof Error ? err.message : "문제 생성 실패";
                enqueue("error", {
                  message: `문제 ${i + 1} 생성 실패: ${message}`,
                  index: i,
                  partial: true,
                });

                enqueue("progress", {
                  stage: "generating",
                  current: completedCount,
                  total: questionCount,
                });
              })
          );

          await Promise.allSettled(settled);
        }

        if (!isCancelled) {
          enqueue("complete", {
            totalQuestions: questionCount,
            successCount,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "문제 생성 중 오류가 발생했습니다.";
        enqueue("error", { message, partial: false });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
    cancel() {
      isCancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
