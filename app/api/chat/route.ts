// Node.js Runtime 사용 (4MB → 25MB 업로드 한도 증가)
export const runtime = "nodejs";

// Route configuration
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { searchRelevantMaterials } from "@/lib/material-search";
import { type PromptLanguage, buildStudentChatSystemPrompt } from "@/lib/prompts";
import { handleCorsPreFlight } from "@/lib/cors";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest, chatRequestSchema } from "@/lib/validations";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { currentUser } from "@/lib/get-current-user";
import { resolveChatQIdx, extractQuestionAiContext } from "@/lib/chat-qidx";
import { classifyMessageType, type MessageType } from "@/lib/message-classification";
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
    { ok: true, route: "/api/chat", methods: ["POST", "OPTIONS"] },
    { status: 200, headers: { Allow: "POST, OPTIONS" } },
  );
}

// Lazy Supabase client getter — creates a fresh client per invocation
// to avoid stale connections in serverless environments
function getSupabase() {
  return getSupabaseServer();
}

type RagResult = {
  relevantMaterialsText: string;
  topSimilarity: number | null;
  resultsCount: number;
  method: "vector" | "keyword" | "none";
};

// 수업 자료 컨텍스트 정제 (노이즈 제거)
function cleanContext(text: string): string {
  if (!text || typeof text !== "string") return "";

  // 예: "G G G" / "A A A A" 같은 단일 문자 반복 제거
  let cleaned = text.replace(/\b([A-Za-z])(?:\s+\1){2,}\b/g, "");

  // 예: "GGGGGG" 같은 동일 문자 과도 반복 제거
  cleaned = cleaned.replace(/(.)\1{4,}/g, "");

  // 예: 동일 단어 4회 이상 반복 제거 (공백/줄바꿈 포함)
  cleaned = cleaned.replace(/\b(\w+)(?:\s+\1){3,}\b/gi, "$1");

  // 공백 정리
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

async function getRagContext(params: {
  message: string;
  examId?: string;
  examMaterialsText?: Array<{ url: string; text: string; fileName: string }>;
  userId?: string;
  sessionId?: string;
  qIdx?: number;
}): Promise<RagResult> {
  const { message, examId, examMaterialsText, userId, sessionId, qIdx } = params;
  if (!examId) {
    return {
      relevantMaterialsText: "",
      topSimilarity: null,
      resultsCount: 0,
      method: "none",
    };
  }

  try {
    const { searchMaterialChunks, formatSearchResultsAsContext } = await import(
      "@/lib/search-chunks"
    );

    const searchResults = await searchMaterialChunks(message, {
      examId,
      matchThreshold: 0.2, // 실제 유사도가 0.2~0.4 정도이므로 낮춤
      matchCount: 5,
      route: "/api/chat",
      userId,
      sessionId,
      qIdx,
      metadata: {
        source: "student_chat_rag",
      },
    });

    const topSimilarityRaw = searchResults[0]?.similarity;
    const topSimilarity =
      typeof topSimilarityRaw === "number" ? topSimilarityRaw : null;

    if (searchResults.length > 0) {
      const context = formatSearchResultsAsContext(searchResults);
      const cleaned = cleanContext(context);
      return {
        relevantMaterialsText: cleaned,
        topSimilarity,
        resultsCount: searchResults.length,
        method: "vector",
      };
    }

    let materials = examMaterialsText;
    if (!materials) {
      const { data: examData } = await getSupabase()
        .from("exams")
        .select("materials_text")
        .eq("id", examId)
        .single();

      if (examData?.materials_text && Array.isArray(examData.materials_text)) {
        materials = examData.materials_text as Array<{
          url: string;
          text: string;
          fileName: string;
        }>;
      }
    }

    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return {
        relevantMaterialsText: "",
        topSimilarity: null,
        resultsCount: 0,
        method: "none",
      };
    }

    const keywordContext = searchRelevantMaterials(materials, message, 3, 2000);
    const cleaned = cleanContext(keywordContext);
    return {
      relevantMaterialsText: cleaned,
      topSimilarity: null,
      resultsCount: cleaned.length > 0 ? 1 : 0,
      method: "keyword",
    };
  } catch (error) {
    logError("[chat] RAG 검색 실패", error, { path: "/api/chat" });
    return {
      relevantMaterialsText: "",
      topSimilarity: null,
      resultsCount: 0,
      method: "none",
    };
  }
}

// 공통 Completion 함수 - Responses API 사용 (previous_response_id 방식)
async function getAIResponse(
  systemPrompt: string,
  userMessage: string,
  previousResponseId: string | null = null,
  tracking?: {
    userId?: string;
    examId?: string;
    sessionId?: string;
    qIdx?: number;
  }
): Promise<{
  response: string;
  responseId: string;
  tokensUsed?: number;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    cachedInputTokens: number | null;
    reasoningTokens: number | null;
  } | null;
}> {
  try {
    const tracked = await callTrackedResponse(
      () =>
        getOpenAI().responses.create({
          model: AI_MODEL,
          instructions: systemPrompt,
          input: userMessage,
          previous_response_id: previousResponseId || undefined,
          store: true,
        }),
      {
        feature: "student_chat",
        route: "/api/chat",
        model: AI_MODEL,
        userId: tracking?.userId,
        examId: tracking?.examId,
        sessionId: tracking?.sessionId,
        qIdx: tracking?.qIdx,
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
    const response = tracked.data;

    // output 배열에서 텍스트 추출
    const responseText = extractResponseText(response.output);

    if (!responseText || responseText.trim().length === 0) {
      return {
        response:
          "I'm sorry, I couldn't process your question. Please try rephrasing it.",
        responseId: response.id,
        usage: tracked.usage,
      };
    }

    return {
      response: responseText,
      responseId: response.id,
      tokensUsed: tracked.usage?.totalTokens ?? undefined,
      usage: tracked.usage,
    };
  } catch (openaiError) {
    logError("OpenAI Responses API error", openaiError, { path: "/api/chat" });
    throw new Error(
      `OpenAI Responses API failed: ${(openaiError as Error).message}`,
    );
  }
}

async function fetchPreviousResponseId(params: {
  sessionId: string;
  qIdx: number;
}): Promise<string | null> {
  const { sessionId, qIdx } = params;
  const { data, error } = await getSupabase()
    .from("messages")
    .select("response_id")
    .eq("session_id", sessionId)
    .eq("q_idx", qIdx)
    .eq("role", "ai")
    .not("response_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    logError("Error fetching previous response_id", error, { path: "/api/chat" });
  }

  return data?.response_id || null;
}

async function incrementUsedClarifications(params: {
  sessionId: string;
  skip?: boolean;
}): Promise<void> {
  const { sessionId, skip } = params;
  if (skip) return;

  // Atomic increment via RPC (prevents race conditions with concurrent requests)
  const { error } = await getSupabase().rpc("increment_used_clarifications", {
    p_session_id: sessionId,
    p_amount: 1,
  });
  if (error) {
    throw new Error(`Failed to increment used_clarifications: ${error.message}`);
  }
}

async function resolveTempSession(params: {
  sessionId: string;
  examId?: string;
  studentId?: string;
}): Promise<{
  actualSessionId: string;
  usedClarifications?: number;
  skipIncrementUsedClarifications: boolean;
}> {
  const { sessionId, examId, studentId } = params;
  let actualSessionId = sessionId;
  let usedClarifications: number | undefined;
  let skipIncrementUsedClarifications = false;

  if (!examId || !studentId) {
    return {
      actualSessionId,
      usedClarifications,
      skipIncrementUsedClarifications,
    };
  }

  const { data: existingSession } = await getSupabase()
    .from("sessions")
    .select("id, used_clarifications")
    .eq("exam_id", examId)
    .eq("student_id", studentId)
    .single();

  if (existingSession) {
    actualSessionId = existingSession.id;
    usedClarifications = existingSession.used_clarifications ?? 0;
    return {
      actualSessionId,
      usedClarifications,
      skipIncrementUsedClarifications,
    };
  }

  // 새 세션은 첫 대화에서 used_clarifications가 1이 되도록 바로 세팅 (추가 update 왕복 제거)
  const { data: newSession } = await getSupabase()
    .from("sessions")
    .insert([
      { exam_id: examId, student_id: studentId, used_clarifications: 1 },
    ])
    .select("id, used_clarifications")
    .single();

  if (newSession) {
    actualSessionId = newSession.id;
    usedClarifications = newSession.used_clarifications ?? 1;
    skipIncrementUsedClarifications = true;
  }

  return {
    actualSessionId,
    usedClarifications,
    skipIncrementUsedClarifications,
  };
}

async function handleChatLogic(params: {
  sessionId: string;
  message: string;
  qIdx: number;
  questionId?: string;
  examTitle?: string;
  examCode: string;
  examId?: string;
  examMaterialsText?: Array<{ url: string; text: string; fileName: string }>;
  currentQuestionText?: string;
  currentQuestionAiContext?: string;
  skipIncrementUsedClarifications?: boolean;
  userId?: string;
  language?: PromptLanguage;
}): Promise<{
  aiResponse: string;
  responseId: string;
  topSimilarity: number | null;
  warnings: string[];
}> {
  const {
    sessionId,
    message,
    qIdx,
    questionId,
    examTitle,
    examCode,
    examId,
    examMaterialsText,
    currentQuestionText,
    currentQuestionAiContext,
    skipIncrementUsedClarifications,
    userId,
    language,
  } = params;
  const warnings: string[] = [];

  const messageTypePromise = classifyMessageType(message).catch(
    () => "other" as MessageType,
  );
  const ragPromise = getRagContext({
    message,
    examId,
    examMaterialsText,
    userId,
    sessionId,
    qIdx,
  });
  const previousResponsePromise = fetchPreviousResponseId({ sessionId, qIdx });

  // 사용자 메시지 저장은 message_type / rag topSimilarity를 포함 (대기 최소화를 위해 병렬로 진행)
  const insertUserPromise = (async () => {
    const [messageType, rag] = await Promise.all([
      messageTypePromise,
      ragPromise,
    ]);
    const userMsgPayload = {
      session_id: sessionId,
      q_idx: qIdx,
      role: "user",
      content: message,
      message_type: messageType,
      metadata: {
        rag: {
          topSimilarity: rag.topSimilarity,
          resultsCount: rag.resultsCount,
          method: rag.method,
        },
      },
    };
    const { error } = await getSupabase().from("messages").insert([userMsgPayload]);
    if (error) {
      // P1-9: Retry once on user message insert failure (same pattern as AI message)
      logError("Error saving user message — retrying once", error, { path: "/api/chat" });
      const { error: retryError } = await getSupabase().from("messages").insert([
        { ...userMsgPayload, metadata: { ...userMsgPayload.metadata, _retried: true } },
      ]);
      if (retryError) {
        logError("Error saving user message — retry also failed", retryError, { path: "/api/chat" });
      }
    }
  })();

  // 세 작업은 동시에 시작되며, 응답 반환 전에는 반드시 모두 완료되도록 await
  const rag = await ragPromise;
  const previousResponseId = await previousResponsePromise;
  await insertUserPromise;

  // RAG 검색 결과에 따라 주의문 추가
  let ragWarning = "";
  if (rag.resultsCount === 0) {
    ragWarning = "\n\n[수업 자료 검색 결과 없음] 이 질문과 관련된 수업 자료를 찾지 못했습니다. 수업 자료에 없는 내용을 만들어내지 마세요. 모르면 모른다고 답하세요.";
  } else if (rag.topSimilarity !== null && rag.topSimilarity < 0.3) {
    ragWarning = "\n\n[관련성 낮음] 검색된 수업 자료의 관련성이 낮습니다. 답변 시 주의하고, 확신할 수 없는 내용은 추측하지 마세요.";
  }

  const systemPrompt = buildStudentChatSystemPrompt({
    examTitle,
    examCode,
    questionId,
    currentQuestionText,
    currentQuestionAiContext,
    relevantMaterialsText: rag.relevantMaterialsText,
    language,
  }) + ragWarning;

  const { response: aiResponse, responseId, tokensUsed, usage } = await getAIResponse(
    systemPrompt,
    message,
    previousResponseId,
    {
      userId,
      examId,
      sessionId,
      qIdx,
    }
  );

  // AI 응답/세션 업데이트는 반드시 응답 전에 await (fetch failed 방지)
  const insertAiPromise = getSupabase().from("messages").insert([
    {
      session_id: sessionId,
      q_idx: qIdx,
      role: "ai",
      content: aiResponse,
      response_id: responseId,
      tokens_used: tokensUsed ?? null,
      metadata: {
        rag: {
          topSimilarity: rag.topSimilarity,
          resultsCount: rag.resultsCount,
          method: rag.method,
        },
        usage: usage
          ? {
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              total_tokens: usage.totalTokens,
              cached_input_tokens: usage.cachedInputTokens,
              reasoning_tokens: usage.reasoningTokens,
            }
          : {},
      },
    },
  ]);

  const incrementPromise = incrementUsedClarifications({
    sessionId,
    skip: !!skipIncrementUsedClarifications,
  });

  const [aiInsertSettled, incrementSettled] = await Promise.allSettled([
    insertAiPromise,
    incrementPromise,
  ]);

  // P0-2: Retry once on AI message insert failure to prevent grading evidence loss
  const aiInsertFailed =
    aiInsertSettled.status === "rejected" || aiInsertSettled.value?.error;
  if (aiInsertFailed) {
    const firstError =
      aiInsertSettled.status === "rejected"
        ? aiInsertSettled.reason
        : aiInsertSettled.value?.error;
    logError("Error saving AI message — retrying once", firstError, { path: "/api/chat" });

    const { error: retryError } = await getSupabase().from("messages").insert([
      {
        session_id: sessionId,
        q_idx: qIdx,
        role: "ai",
        content: aiResponse,
        response_id: responseId,
        tokens_used: tokensUsed ?? null,
        metadata: {
          rag: {
            topSimilarity: rag.topSimilarity,
            resultsCount: rag.resultsCount,
            method: rag.method,
          },
          usage: usage
            ? {
                input_tokens: usage.inputTokens,
                output_tokens: usage.outputTokens,
                total_tokens: usage.totalTokens,
                cached_input_tokens: usage.cachedInputTokens,
                reasoning_tokens: usage.reasoningTokens,
              }
            : {},
          _retried: true,
        },
      },
    ]);

    if (retryError) {
      logError("Error saving AI message — retry also failed", retryError, { path: "/api/chat" });
      warnings.push("message_save_failed_critical");
    }
  }
  if (incrementSettled.status === "rejected") {
    logError("Error incrementing clarifications", incrementSettled.reason, { path: "/api/chat" });
    warnings.push("clarification_increment_failed");
  }

  return { aiResponse, responseId, topSimilarity: rag.topSimilarity, warnings };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Input validation
    const validation = validateRequest(chatRequestSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error!, 400);
    }

    const {
      message,
      sessionId,
      questionId,
      questionIdx,
      examTitle: requestExamTitle,
      examCode: requestExamCode,
      examId,
      studentId,
      currentQuestionText,
      // NOTE: currentQuestionAiContext 는 클라이언트에서 받지 않는다. 정답/채점 컨텍스트는
      // 학생에게 내려주지 않으므로(민감 필드 스트립), 서버가 원본 exam 에서 직접 파생한다.
    } = validation.data;

    // Require authentication unconditionally
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Authentication required", 401);
    }

    // Verify student ownership: studentId from body must match authenticated user
    if (studentId && user.id !== studentId) {
      return errorJson("FORBIDDEN", "Student ID mismatch", 403);
    }

    // Rate limiting by authenticated user ID (falls back to sessionId for unauthenticated)
    const rateLimitKey = `chat:${user?.id || sessionId}`;
    const rl = await checkRateLimitAsync(rateLimitKey, RATE_LIMITS.chat);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // 안전한 문제 인덱스 계산 — 검증된 questionIdx 만 사용한다.
    // (questionId 는 UUID 라 parseInt 로 숫자화하면 문항 오염을 유발 → 폴백 제거)
    const safeQIdx = resolveChatQIdx(questionIdx);

    const isTemp = sessionId.startsWith("temp_");

    // ✅ 임시/정규 공통 처리: 세션/시험 컨텍스트만 준비하고 나머지는 handleChatLogic로 통합
    if (isTemp) {
      const {
        actualSessionId,
        usedClarifications,
        skipIncrementUsedClarifications,
      } = await resolveTempSession({ sessionId, examId, studentId });

      // exam 언어/문항 조회. 언어는 영문 프롬프트 분기용, 문항은 강사 채점 컨텍스트
      // (ai_context)를 서버에서 직접 파생하기 위함(클라이언트는 ai_context 를 받지 않음).
      let tempExamLanguage: PromptLanguage = "ko";
      let currentQuestionAiContext: string | undefined;
      if (examId) {
        const { data: examLangRow } = await getSupabase()
          .from("exams")
          .select("language, questions")
          .eq("id", examId)
          .maybeSingle();
        if (examLangRow?.language === "en") {
          tempExamLanguage = "en";
        }
        currentQuestionAiContext = extractQuestionAiContext(
          examLangRow?.questions,
          safeQIdx
        );
      }

      // temp_로 남아있는 경우(DB 적재 불가): AI 응답은 하되 DB 저장은 생략
      if (!actualSessionId || actualSessionId.startsWith("temp_")) {
        const rag = await getRagContext({
          message,
          examId,
          userId: user?.id,
          sessionId,
          qIdx: safeQIdx,
        });

        // RAG 검색 결과에 따라 주의문 추가
        let tempRagWarning = "";
        if (rag.resultsCount === 0) {
          tempRagWarning = "\n\n[수업 자료 검색 결과 없음] 이 질문과 관련된 수업 자료를 찾지 못했습니다. 수업 자료에 없는 내용을 만들어내지 마세요. 모르면 모른다고 답하세요.";
        } else if (rag.topSimilarity !== null && rag.topSimilarity < 0.3) {
          tempRagWarning = "\n\n[관련성 낮음] 검색된 수업 자료의 관련성이 낮습니다. 답변 시 주의하고, 확신할 수 없는 내용은 추측하지 마세요.";
        }

        const prompt = buildStudentChatSystemPrompt({
          examTitle: requestExamTitle,
          examCode: requestExamCode || "TEMP",
          questionId,
          currentQuestionText,
          currentQuestionAiContext,
          relevantMaterialsText: rag.relevantMaterialsText,
          language: tempExamLanguage,
        }) + tempRagWarning;

        const previousResponseId = null;
        const { response: aiResponse } = await getAIResponse(
          prompt,
          message,
          previousResponseId,
          {
            userId: user?.id,
            examId,
            sessionId,
            qIdx: safeQIdx,
          }
        );

        return successJson({
          response: aiResponse,
          timestamp: new Date().toISOString(),
          examCode: requestExamCode || "TEMP",
          questionId: questionId || "temp",
        });
      }

      const { aiResponse, warnings } = await handleChatLogic({
        sessionId: actualSessionId,
        message,
        qIdx: safeQIdx,
        questionId,
        examTitle: requestExamTitle,
        examCode: requestExamCode || "TEMP",
        examId,
        currentQuestionText,
        currentQuestionAiContext,
        skipIncrementUsedClarifications,
        userId: user?.id ?? studentId,
        language: tempExamLanguage,
      });

      return successJson({
        response: aiResponse,
        timestamp: new Date().toISOString(),
        examCode: requestExamCode || "TEMP",
        questionId: questionId || "temp",
        ...(warnings?.length ? { warnings } : {}),
      });
    }

    // ✅ 정규 세션 처리 (컨텍스트 조회)
    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select("id, exam_id, student_id, used_clarifications, submitted_at")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      if (sessionError) {
        logError("[CHAT] Session lookup failed", sessionError, {
          path: "api/chat/route.ts",
          additionalData: { sessionId },
        });
      }
      return errorJson("INVALID_SESSION", "Invalid session", 400);
    }

    // Verify session ownership: session must belong to authenticated user
    if (user && session.student_id && session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Session does not belong to this user", 403);
    }

    if (session.submitted_at) {
      return errorJson("SESSION_SUBMITTED", "이미 제출된 세션입니다.", 403);
    }

    if (!session.exam_id) {
      return errorJson("MISSING_EXAM_INFO", "Session is missing exam information", 400);
    }

    const { data: exam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, code, title, questions, materials_text, chat_weight, status, language")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404, examError?.message);
    }

    if (exam.status === "closed") {
      return errorJson("EXAM_CLOSED", "시험이 종료되었습니다.", 403);
    }

    const questionCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
    if (questionCount > 0 && safeQIdx >= questionCount) {
      return errorJson("INVALID_QUESTION_INDEX", "Question index out of range", 400);
    }

    const effectiveExamId = examId || exam.id;

    const materialsText = Array.isArray(exam.materials_text)
      ? (exam.materials_text as Array<{
          url: string;
          text: string;
          fileName: string;
        }>)
      : undefined;

    const examLanguage: PromptLanguage = exam.language === "en" ? "en" : "ko";

    // 강사 채점 컨텍스트(ai_context)는 학생 응답에서 스트립되므로 클라이언트가 아닌
    // 서버가 로드한 원본 exam.questions 에서 직접 파생한다.
    const currentQuestionAiContext = extractQuestionAiContext(exam.questions, safeQIdx);

    const { aiResponse, warnings } = await handleChatLogic({
      sessionId,
      message,
      qIdx: safeQIdx,
      questionId,
      examTitle: requestExamTitle,
      examCode: exam.code,
      examId: effectiveExamId,
      examMaterialsText: materialsText,
      currentQuestionText,
      currentQuestionAiContext,
      userId: user?.id ?? session.student_id,
      language: examLanguage,
    });

    return successJson({
      response: aiResponse,
      timestamp: new Date().toISOString(),
      examCode: exam.code,
      questionId,
      ...(warnings?.length ? { warnings } : {}),
    });
  } catch (error) {
    logError("Chat API error", error, { path: "/api/chat" });
    const errorMessage = error instanceof Error ? error.message : String(error);

    return errorJson(
      "INTERNAL_ERROR",
      "죄송합니다. 응답을 생성하는 중에 오류가 발생했습니다. 다시 시도해주세요.",
      500,
      process.env.NODE_ENV === "development" ? errorMessage : undefined
    );
  }
}
