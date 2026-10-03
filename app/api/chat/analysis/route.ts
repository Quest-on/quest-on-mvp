// 분석 파트너 문항의 코드 실행 턴 (이슈 #545). OpenAI 호스팅 code_interpreter 를 foreground stream 으로 쓴다.
//
// 왜 `/api/chat` 을 분기하지 않고 새 라우트인가
//   - 함수 시간: 분석 턴은 30~60초, 길면 2~4분이다. 이 라우트만 `maxDuration = 300` 이고 `/api/chat` 은 60초 그대로다.
//     같은 라우트에 두면 사례형 채팅까지 300초 상한을 갖게 된다.
//   - 화면 처리: 이 라우트는 SSE 로 진행 상황(코드 실행 n 번째, 경과 시간)을 보낸다. `/api/chat` 은 JSON 한 번이다.
//   - 회귀 위험: 사례형과 도구 없는 분석 파트너 경로(`/api/chat`)의 코드와 요청 모양을 바꾸지 않는다.
// 켜지는 조건이 아니면(분석 파트너가 아님, 학생 공개 데이터 파일 없음, temp 세션) 아무것도 저장하지 않고 409 를
// 돌려주고, 화면은 같은 메시지를 `/api/chat` 으로 보낸다.
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, after } from "next/server";
import { AI_MODEL } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest, chatRequestSchema } from "@/lib/validations";
import { errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { resolveChatQIdx, extractQuestionAiContext } from "@/lib/chat-qidx";
import { resolveExamAiProfile } from "@/lib/exam-ai-profile";
import { ANALYSIS_UNAVAILABLE_ERROR, type AnalysisStreamEvent } from "@/lib/analysis-exec/client-events";
import {
  decideAnalysisExecution,
  listStudentVisibleMaterials,
  withOriginalFileNames,
} from "@/lib/analysis-exec/eligibility";
import { SSE_HEARTBEAT_INTERVAL_MS } from "@/lib/analysis-exec/limits";
import { getOpenAIHttpConfig } from "@/lib/analysis-exec/openai-http";
import { SSE_HEARTBEAT, formatSseEvent } from "@/lib/analysis-exec/sse";
import { ANALYSIS_ROUTE, runAnalysisTurn } from "@/lib/analysis-exec/turn-runner";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable(reason: "not_analysis_partner" | "no_data_files" | "temp_session") {
  return errorJson(ANALYSIS_UNAVAILABLE_ERROR, "Analysis execution is not available for this question", 409, {
    reason,
  });
}

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  try {
    // 1. 인증. 데이터에 손대기 전에 한다.
    const user = await currentUser();
    if (!user) return errorJson("UNAUTHORIZED", "Authentication required", 401);

    // 2. 속도 제한. `/api/chat` 과 같은 버킷 크기, 다른 키.
    const rl = await checkRateLimitAsync(`chat-analysis:${user.id}`, RATE_LIMITS.chat);
    if (!rl.allowed) return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);

    // 3. 입력 검증(`/api/chat` 과 같은 스키마: 메시지 정리 포함).
    const body = await request.json().catch(() => null);
    const validation = validateRequest(chatRequestSchema, body);
    if (!validation.success) return errorJson("VALIDATION_ERROR", validation.error!, 400);
    const { message, sessionId, questionId, questionIdx, examTitle, studentId, currentQuestionText } = validation.data;

    if (studentId && studentId !== user.id) return errorJson("FORBIDDEN", "Student ID mismatch", 403);

    // temp 세션은 DB 세션이 없어 컨테이너와 기록을 남길 곳이 없다. 도구 없는 경로로 보낸다.
    if (!UUID_RE.test(sessionId)) return unavailable("temp_session");

    const supabase = getSupabaseServer();

    // 4. 세션 소유권.
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, student_id, submitted_at")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) {
      void logError("[chat-analysis] session lookup failed", sessionError, { path: ANALYSIS_ROUTE });
    }
    if (!session) return errorJson("INVALID_SESSION", "Invalid session", 400);
    if (session.student_id !== user.id) return errorJson("FORBIDDEN", "Session does not belong to this user", 403);
    if (session.submitted_at) {
      return errorJson("SESSION_SUBMITTED", "Session already submitted", 403);
    }
    if (!session.exam_id) return errorJson("MISSING_EXAM_INFO", "Session is missing exam information", 400);

    // 5. 시험과 문항.
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, code, title, questions, status, language")
      .eq("id", session.exam_id)
      .maybeSingle();
    if (examError || !exam) return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    if (exam.status === "closed") return errorJson("EXAM_CLOSED", "Exam is closed", 403);

    const qIdx = resolveChatQIdx(questionIdx);
    const questionCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
    if (questionCount > 0 && qIdx >= questionCount) {
      return errorJson("INVALID_QUESTION_INDEX", "Question index out of range", 400);
    }

    // 6. 켜지는 조건: 분석 파트너 + 학생 공개 데이터 파일.
    const profile = resolveExamAiProfile({ exam: { language: exam.language, questions: exam.questions }, qIdx });
    if (profile.role !== "analysis_partner") return unavailable("not_analysis_partner");

    // 공개 자료 컬럼(에픽 A: student_materials, 원래 이름 material_names)은 따로 읽는다. 컬럼이 아직 없는 DB 에서
    // 위 조회까지 실패하지 않게 하려는 것이다.
    const { data: materialsRow, error: materialsError } = await supabase
      .from("exams")
      .select("materials, materials_text, student_materials, material_names")
      .eq("id", exam.id)
      .maybeSingle();
    if (materialsError) {
      void logError("[chat-analysis] student materials lookup failed", materialsError, { path: ANALYSIS_ROUTE });
      // 컬럼이 아직 없는 DB(#544 의 DDL 전)는 공개 자료가 없는 것과 같다 — 도구 없는 경로로 보낸다.
      // 그 밖의 조회 오류는 일시적일 수 있다. 409 를 주면 화면이 그 문항을 도구 없는 경로로 고정하므로 503 을 준다.
      if ((materialsError as { code?: string }).code !== "42703") {
        return errorJson("ANALYSIS_LOOKUP_FAILED", "Could not load exam materials. Please try again.", 503);
      }
    }
    const visible = listStudentVisibleMaterials((materialsRow ?? {}) as Record<string, unknown>);
    if (visible.error) {
      void logError("[chat-analysis] getStudentVisibleMaterials failed", visible.error, { path: ANALYSIS_ROUTE });
    }
    const decision = decideAnalysisExecution({
      profile,
      visibleMaterials: withOriginalFileNames(visible.materials, (materialsRow as { materials_text?: unknown } | null)?.materials_text),
    });
    if (!decision.enabled) return unavailable(decision.reason);

    let http;
    try {
      http = getOpenAIHttpConfig();
    } catch (error) {
      void logError("[chat-analysis] OpenAI is not configured", error, { path: ANALYSIS_ROUTE });
      return errorJson("INTERNAL_ERROR", "AI is not configured", 500);
    }

    // 7. SSE 스트림. 여기부터는 이벤트로 결과를 알린다.
    const encoder = new TextEncoder();
    const clientAbort = new AbortController();
    // 연결이 끊긴 것을 두 경로로 받는다: 요청 신호와 스트림 취소(아래 cancel).
    request.signal?.addEventListener("abort", () => clientAbort.abort(new Error("client_cancelled")), { once: true });
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    // `start` 가 생성 중에 바로 채운다. 아래 즉시 실행 함수 안에서 null 로 좁혀지지 않게 단언으로 둔다.
    let controller = null as ReadableStreamDefaultController<Uint8Array> | null;
    const write = (chunk: string) => {
      if (closed || !controller) return;
      try {
        controller.enqueue(encoder.encode(chunk));
      } catch {
        closed = true;
      }
    };
    const send = (event: AnalysisStreamEvent) => write(formatSseEvent(event.event, event.data));

    const readable = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        heartbeat = setInterval(() => write(SSE_HEARTBEAT), SSE_HEARTBEAT_INTERVAL_MS);
      },
      // 학생이 탭을 닫거나 이동했다. 위층 스트림을 끊고(아무도 읽지 않는 응답에 돈을 쓰지 않게), 실행된 셀은
      // runAnalysisTurn 이 client_cancelled 로 기록한다.
      cancel() {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        clientAbort.abort(new Error("client_cancelled"));
      },
    });

    // 턴은 스트림과 따로 돈다. 연결이 끊겨도 실행된 셀의 기록(AI 메시지)과 ai_events 가 끝까지 남도록 `after()` 에
    // 맡긴다(응답이 끝난 뒤에도 함수가 이 프로미스를 기다린다). runAnalysisTurn 은 던지지 않는다.
    const turn = (async () => {
      try {
        await runAnalysisTurn(
          {
            supabase,
            http,
            model: AI_MODEL,
            userId: user.id,
            sessionId,
            examId: exam.id as string,
            qIdx,
            message,
            questionId,
            examTitle,
            examCode: exam.code as string,
            currentQuestionText,
            // 교수 메모는 클라이언트에서 받지 않고 서버가 로드한 문항에서 파생한다(`/api/chat` 과 같다).
            currentQuestionAiContext: extractQuestionAiContext(exam.questions, qIdx),
            dataSources: decision.dataSources,
            startedAtMs,
            clientSignal: clientAbort.signal,
          },
          send
        );
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          try {
            controller?.close();
          } catch {
            // 이미 닫혔으면 무시한다.
          }
        }
      }
    })();
    try {
      after(turn);
    } catch {
      // 요청 범위 밖(테스트)에서는 `after()` 를 쓸 수 없다. 턴은 그대로 돈다.
    }

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    void logError("[chat-analysis] request failed", error, { path: ANALYSIS_ROUTE });
    return errorJson("INTERNAL_ERROR", "Failed to start analysis", 500);
  }
}
