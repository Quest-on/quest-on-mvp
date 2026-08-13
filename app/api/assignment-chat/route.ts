export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { currentUser } from "@/lib/get-current-user";
import { logError } from "@/lib/logger";
import { buildAssignmentChatSystemPrompt } from "@/lib/prompts";
import {
  extractUsageFromOpenAIResult,
  recordAiStreamEvent,
} from "@/lib/ai-tracking";
import { createCurrentExecutionContext } from "@/lib/ai-execution-context";
import { createRouteDeadline } from "@/lib/ai-deadline";
import { applyProfileToResponsesBody } from "@/lib/ai-task-profile";
import { loadCurrentVersion } from "@/lib/ai-config-store";

function getSupabase() {
  return getSupabaseServer();
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId, examId, studentId, previousResponseId } = body;

    if (!message || !sessionId || !examId) {
      return new Response(
        JSON.stringify({ error: "VALIDATION_ERROR", message: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Auth
    const user = await currentUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "UNAUTHORIZED", message: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (studentId && user.id !== studentId) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN", message: "Student ID mismatch" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Rate limit
    const rl = await checkRateLimitAsync(`assignment-chat:${user.id}`, RATE_LIMITS.chat);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: "RATE_LIMITED", message: "Too many requests" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // 세션 소유권 검증
    //
    // sessionId 는 body 로 들어온다. 인증만 하고 소유자를 대조하지 않으면
    // 로그인한 아무나 남의 sessionId 로 messages 에 행을 삽입할 수 있다.
    // 동의 게이트도 이 경로를 route 에 위임하므로 여기서 막지 않으면
    // 아무도 안 보는 셈이 된다.
    const { data: ownedSession } = await getSupabase()
      .from("sessions")
      .select("id, student_id, exam_id, status, submitted_at")
      .eq("id", sessionId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (!ownedSession || ownedSession.exam_id !== examId) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN", message: "Session not accessible" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 진행 중인 세션에만 쓴다.
    //
    // 제출이 끝난 세션에 계속 메시지를 넣을 수 있으면, 시험 연속성 예외가
    // 영구 우회가 된다. 응시가 끝난 뒤 답안 근거를 덧붙이는 것도 막는다.
    if (ownedSession.submitted_at || ownedSession.status !== "in_progress") {
      return new Response(
        JSON.stringify({ error: "SESSION_CLOSED", message: "Session is no longer active" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch exam info for context
    const { data: exam } = await getSupabase()
      .from("exams")
      .select("id, title, code, questions, rubric, assignment_prompt, type, language")
      .eq("id", examId)
      .single();

    const validTypes = ["assignment", "report", "code", "erd", "mindmap"];
    if (!exam || !validTypes.includes(exam.type)) {
      return new Response(
        JSON.stringify({ error: "NOT_FOUND", message: "Assignment not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Save user message
    await getSupabase().from("messages").insert([{
      session_id: sessionId,
      q_idx: 0,
      role: "user",
      content: message,
    }]);

    // Build system prompt
    const examLanguage: "ko" | "en" = exam.language === "en" ? "en" : "ko";
    const systemPrompt = buildAssignmentChatSystemPrompt({
      examTitle: exam.title,
      assignmentPrompt: exam.assignment_prompt,
      questions: (exam.questions as Array<{ text: string; type: string }> | null) ?? undefined,
      rubric: exam.rubric as Array<{ evaluationArea: string; detailedCriteria: string }> | undefined,
      language: examLanguage,
    });

    // Fetch previous response_id for conversation chaining
    let prevResponseId = previousResponseId || null;
    if (!prevResponseId) {
      const { data: lastMsg } = await getSupabase()
        .from("messages")
        .select("response_id")
        .eq("session_id", sessionId)
        .eq("q_idx", 0)
        .eq("role", "ai")
        .not("response_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      prevResponseId = lastMsg?.response_id || null;
    }

    // ── 실행 컨텍스트 (이슈 #118) ────────────────────────────────────────
    // 모델·요청 옵션·이벤트에 찍힐 config 버전이 전부 이 컨텍스트 하나에서 나온다.
    // 하드코딩된 AI_MODEL 을 쓰면 관리자 설정이 이 경로만 비켜 가고, 이벤트의
    // config_version 도 NULL 로 남아 "어느 설정이 이 응답을 만들었나" 를 못 되짚는다.
    const openai = getOpenAI();
    const aiContext = createCurrentExecutionContext({
      task: "assignment_chat_stream",
      version: await loadCurrentVersion(),
      deadlineMs: createRouteDeadline({ startedAtMs: Date.now(), maxDurationSec: 60 }),
      externalSignal: request.signal,
    });

    const stream = openai.responses.stream(
      applyProfileToResponsesBody(aiContext.profile, {
        instructions: systemPrompt,
        input: message,
        previous_response_id: prevResponseId || undefined,
        store: true,
        stream: true,
        tools: [{ type: "web_search_preview" }],
      }) as Parameters<typeof openai.responses.stream>[0],
      {
        timeout: aiContext.budget.timeout,
        maxRetries: aiContext.budget.maxRetries,
        signal: aiContext.budget.signal,
      }
    );

    // ── 스트림 이벤트 1회성 기록 (이슈 #118) ────────────────────────────
    // 이 경로는 지금까지 ai_events 에 아무것도 남기지 않았다. 학생 채팅 트래픽
    // 전체가 비용·지연 관측에서 빠져 있었다는 뜻이다.
    // 종료 사유가 넷(정상 완료 / 완료 이벤트 없이 종료 / 예외 / 클라이언트 취소)이라
    // settled 플래그로 정확히 한 번만 기록한다.
    const streamStartedAt = Date.now();
    let streamSettled = false;
    let capturedUsage: Parameters<typeof recordAiStreamEvent>[0]["usage"] = null;

    const finalizeStreamEvent = async (outcome: {
      status: "success" | "error" | "timeout" | "client_cancelled";
      responseId?: string | null;
      error?: unknown;
    }): Promise<void> => {
      if (streamSettled) return;
      streamSettled = true;
      await recordAiStreamEvent({
        context: {
          // 학생 채팅 트래픽이다 — 기존 분석 축과 같은 feature 로 남겨야 합산된다.
          feature: "student_chat",
          route: "/api/assignment-chat",
          model: aiContext.profile.model,
          userId: user.id,
          sessionId,
          metadata: { q_idx: 0 },
        },
        status: outcome.status,
        latencyMs: Date.now() - streamStartedAt,
        usage: capturedUsage,
        responseId: outcome.responseId ?? null,
        error: outcome.error,
        // 요청을 만든 그 컨텍스트의 버전을 그대로 찍는다(라벨 재조회 금지).
        configVersion: aiContext.configVersionId,
      });
    };

    // Create SSE response stream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let fullText = "";
        let responseId = "";

        try {
          for await (const event of stream) {
            if (event.type === "response.output_text.delta") {
              const delta = event.delta;
              fullText += delta;
              controller.enqueue(
                encoder.encode(sseEvent("chat_token", { token: delta }))
              );
            } else if (event.type === "response.completed") {
              responseId = event.response.id;
              // 실제 usage 는 completed 이벤트에만 들어 있다. 추정하지 않는다.
              capturedUsage = extractUsageFromOpenAIResult("responses", event.response);

              // Extract citations from output annotations
              const citations: Array<{ title: string; url: string }> = [];
              const output = event.response.output ?? [];
              for (const block of output) {
                if (block.type === "message" && Array.isArray(block.content)) {
                  for (const content of block.content) {
                    if (content.type === "output_text" && Array.isArray(content.annotations)) {
                      for (const annotation of content.annotations) {
                        if (
                          annotation.type === "url_citation" &&
                          annotation.url &&
                          annotation.title
                        ) {
                          const already = citations.some((c) => c.url === annotation.url);
                          if (!already) {
                            citations.push({ title: annotation.title, url: annotation.url });
                          }
                        }
                      }
                    }
                  }
                }
              }

              // Send citations as SSE event if any found
              if (citations.length > 0) {
                controller.enqueue(
                  encoder.encode(sseEvent("citations", { citations }))
                );
              }
            }
          }

          // Done event
          controller.enqueue(
            encoder.encode(sseEvent("done", {
              responseId,
            }))
          );

          // 완료 이벤트를 못 받고 이터레이터가 끝난 경우도 성공이 아니다.
          // usage 가 없으면 completed 가 오지 않은 것이다.
          await finalizeStreamEvent(
            capturedUsage
              ? { status: "success", responseId }
              : {
                  status: "error",
                  responseId,
                  error: new Error("stream ended without response.completed"),
                }
          );

          // Save AI response to DB
          // (메시지 저장은 OpenAI 이벤트 기록과 독립이다 — 하나가 실패해도 다른 하나는 남는다)
          await getSupabase().from("messages").insert([{
            session_id: sessionId,
            q_idx: 0,
            role: "ai",
            content: fullText,
            response_id: responseId,
          }]);

          controller.close();
        } catch (error) {
          logError("[assignment-chat] Stream error", error, { path: "/api/assignment-chat" });
          await finalizeStreamEvent({ status: "error", responseId, error });
          controller.enqueue(
            encoder.encode(sseEvent("error", { message: "Stream error occurred" }))
          );
          controller.close();
        }
      },

      /**
       * 학생이 탭을 닫거나 이동하면 여기로 온다. 이건 실패가 아니라 정상 종료라
       * client_cancelled 로 구분해 기록하고, 밑의 SDK 스트림도 같이 끊는다.
       * 끊지 않으면 아무도 읽지 않는 응답에 계속 돈을 낸다.
       */
      async cancel() {
        try {
          stream.abort();
        } catch {
          // 이미 끝난 스트림이면 무시한다.
        }
        await finalizeStreamEvent({ status: "client_cancelled" });
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logError("[assignment-chat] Error", error, { path: "/api/assignment-chat" });
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
