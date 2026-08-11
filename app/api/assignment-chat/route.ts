export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { currentUser } from "@/lib/get-current-user";
import { logError } from "@/lib/logger";
import { buildAssignmentChatSystemPrompt } from "@/lib/prompts";

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

    // Create streaming response using OpenAI Responses API
    const openai = getOpenAI();

    const stream = openai.responses.stream({
      model: AI_MODEL,
      instructions: systemPrompt,
      input: message,
      previous_response_id: prevResponseId || undefined,
      store: true,
      stream: true,
      tools: [{ type: "web_search_preview" }],
    });

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

          // Save AI response to DB
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
          controller.enqueue(
            encoder.encode(sseEvent("error", { message: "Stream error occurred" }))
          );
          controller.close();
        }
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
