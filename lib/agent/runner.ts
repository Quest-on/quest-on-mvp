/**
 * Quest-On 강사 AI 에이전트 — 러너 (재개형 클라이언트-인터랙티브 루프)
 *
 * 한 턴 = 한 HTTP 요청 = OpenAI Responses API 1회 호출.
 * `after()` 백그라운드 루프는 폐기됐다.
 *
 * 흐름:
 *  1. 첫 턴 — 시스템 프롬프트 + user 프롬프트 + 초기 pageState 로 LLM 호출.
 *  2. LLM 이 UI 액션(function call)을 emit → pending_tool_calls 에 저장하고
 *     last_response_id 를 기록한 뒤 클라이언트에 pendingActions 로 반환.
 *  3. 클라이언트가 편집기에서 실행 → 결과 + 새 pageState 를 보고.
 *  4. 재개 턴 — last_response_id 를 previous_response_id 로, 직전 액션들의
 *     function_call_output(ok/error) + 새 pageState 를 input 으로 LLM 재호출.
 *  5. LLM 이 finish 를 호출하면 done=true, status=completed 로 종료.
 *
 * Responses API 재개 방식:
 *  - 대화 상태는 OpenAI 서버에 store:true 로 보관된다. 우리는 메모리에
 *    messages[] 를 누적하지 않고 previous_response_id 로만 체이닝한다.
 *  - 직전 턴의 각 function call 에 대해 반드시 function_call_output 을
 *    돌려줘야 한다 (call_id 기준 1:1 매칭). 그렇지 않으면 OpenAI 가 거부한다.
 *
 * 오류 처리: 에이전트 수준 오류는 throw 하지 않고 status="failed" + done=true.
 * runId 가 존재하지 않을 때만 throw.
 */

import type OpenAI from "openai";

import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { buildAiTextMetadata, callTrackedResponse } from "@/lib/ai-tracking";
import { logError } from "@/lib/logger";
import {
  type AgentRunRecord,
  appendAgentStep,
  getAgentRun,
  patchAgentRun,
} from "@/lib/agent/store";
import { getOpenAIToolDefinitions, isAgentToolName } from "@/lib/agent/tools";
import type {
  AgentPageState,
  AgentTurnResponse,
  AgentUiAction,
  AgentUiActionEnvelope,
  AgentUiActionResult,
} from "@/lib/agent/ui-actions";

const AGENT_ROUTE = "/api/agent/runs";

type ResponsesResponse = OpenAI.Responses.Response;
type ResponseOutputItem = OpenAI.Responses.ResponseOutputItem;
type ResponseInputItem = OpenAI.Responses.ResponseInputItem;

/** 재개 턴 입력 — 직전 액션 실행 결과 + 실행 후 페이지 상태. */
export interface AgentTurnContinuation {
  results: AgentUiActionResult[];
  pageState: AgentPageState;
}

// ── 시스템 프롬프트 ──────────────────────────────────────────
function buildSystemPrompt(params: { preferences /* required */: string | null }): string {
  const prompt = [
    "너는 강사의 시험 편집기를 직접 운전하는 Quest-On 에이전트다.",
    "너는 DOM 을 직접 조작하지 않는다. 대신 UI 액션(function call)을 emit 하면",
    "클라이언트가 실제 편집기 컨트롤로 그 액션을 실행하고 결과를 보고한다.",
    "",
    "사용 가능한 액션:",
    "- navigate(route): 다른 페이지로 이동. 시험을 새로 만들려면 시험 생성 페이지로 먼저 이동.",
    "- set_exam_title(text): 시험 제목 입력.",
    "- set_topic(text): 문제 생성기의 주제/세부 토픽 입력.",
    "- set_question_count(count): 문항 수 설정 (1~10).",
    "- set_difficulty(difficulty): 난이도 설정 (basic/intermediate/advanced).",
    "- generate_questions(): 현재 설정으로 문제 생성 시작.",
    "- revise_question(index, instruction): 기존 문제 1개 수정.",
    "- add_question(): 빈 문제 1개 추가.",
    "- remove_question(index): 문제 1개 제거.",
    "- finish(summary): 모든 작업 완료 시 호출 → 루프 종료.",
    "",
    "원칙:",
    "- 매 턴 직전 액션들의 실행 결과(ok/error)와 최신 페이지 상태(pageState)를 받는다.",
    "  이 상태가 너의 '페이지 보기'다 — DOM 을 따로 읽지 마라.",
    "- 한 턴에 서로 의존하지 않는 액션은 배치(batch)로 함께 emit 하라.",
    "- 다음 액션이 이전 액션의 결과/상태에 의존하면(예: 생성된 문제를 수정),",
    "  이번 턴엔 emit 하지 말고 다음 턴에서 결과를 본 뒤 emit 하라.",
    "- 액션이 error 로 실패하면 사유를 보고 재시도하거나 대안을 택하라.",
    "- 강사의 요청에 난이도/문항 수 등이 없으면 합리적인 기본값을 택하라.",
    "- 모든 작업이 끝났다고 판단되면 반드시 finish 를 호출해 루프를 종료하라.",
    "- 더 emit 할 액션이 없는데 작업이 끝나지 않았다면 그래도 finish 를 호출하라.",
  ].join("\n");

  if (params.preferences === null || params.preferences.trim().length === 0) return prompt;
  return `${prompt}\n\n${params.preferences}`;
}

// ── pageState 직렬화 ─────────────────────────────────────────
function describePageState(state: AgentPageState): string {
  const questionLines =
    state.questions.length > 0
      ? state.questions
          .map(
            (q) => `  - [${q.index}] (${q.type}) ${q.summary}`
          )
          .join("\n")
      : "  (없음)";
  return [
    "현재 페이지 상태:",
    `- 경로: ${state.route}`,
    `- 시험 제목: ${state.examTitle || "(비어 있음)"}`,
    `- 문항 수: ${state.questionCount}`,
    `- 문제 생성 진행 중: ${state.isGenerating ? "예" : "아니오"}`,
    "- 문제 목록:",
    questionLines,
  ].join("\n");
}

// ── 첫 턴 input ──────────────────────────────────────────────
function buildFirstTurnInput(
  prompt: string,
  pageState: AgentPageState
): string {
  return [
    "강사의 요청:",
    prompt,
    "",
    describePageState(pageState),
  ].join("\n");
}

// ── 재개 턴 input ────────────────────────────────────────────
/**
 * 직전 턴의 function call 들에 대한 function_call_output + 새 pageState.
 * call_id 는 pending_tool_calls 에 저장해 둔 envelope.id 와 일치한다.
 */
function buildContinuationInput(
  pending: AgentUiActionEnvelope[],
  continuation: AgentTurnContinuation
): ResponseInputItem[] {
  const resultById = new Map<string, AgentUiActionResult>(
    continuation.results.map((r) => [r.id, r])
  );

  const items: ResponseInputItem[] = [];

  // 각 대기 액션에 대해 반드시 결과를 1:1 로 돌려준다.
  // 클라이언트가 보고하지 않은 액션은 미실행으로 간주해 error 로 채운다.
  for (const envelope of pending) {
    const result = resultById.get(envelope.id);
    const output = result
      ? { ok: result.ok, error: result.error ?? null }
      : { ok: false, error: "클라이언트가 이 액션의 결과를 보고하지 않았습니다." };
    items.push({
      type: "function_call_output",
      call_id: envelope.id,
      output: JSON.stringify(output),
    });
  }

  // 실행 후 최신 페이지 상태를 user 메시지로 동봉한다.
  items.push({
    role: "user",
    content: [
      "직전 액션들을 실행했다. 결과는 위 function_call_output 에 있다.",
      "",
      describePageState(continuation.pageState),
      "",
      "이어서 다음 액션을 emit 하거나, 작업이 끝났다면 finish 를 호출하라.",
    ].join("\n"),
  });

  return items;
}

// ── OpenAI 호출 ──────────────────────────────────────────────
async function callModel(
  params: {
    input: string | ResponseInputItem[];
    previousResponseId: string | null;
    runId: string;
    userId: string;
    phase: "first_turn" | "resume_turn";
  }
): Promise<{ response: ResponsesResponse; tokensUsed: number; costUsdMicros: number }> {
  const tracked = await callTrackedResponse(
    () =>
      getOpenAI().responses.create({
        model: AI_MODEL,
        instructions: buildSystemPrompt({ preferences: null }),
        input: params.input,
        tools: getOpenAIToolDefinitions(),
        store: true,
        previous_response_id: params.previousResponseId ?? undefined,
      }),
    {
      feature: "instructor_agent",
      route: AGENT_ROUTE,
      model: AI_MODEL,
      userId: params.userId,
      metadata: buildAiTextMetadata({
        extra: {
          agent_phase: params.phase,
          run_id: params.runId,
          ...(params.previousResponseId
            ? { previous_response_id: params.previousResponseId }
            : {}),
        },
      }),
    }
  );

  return {
    response: tracked.data,
    tokensUsed: tracked.usage?.totalTokens ?? 0,
    costUsdMicros: tracked.estimatedCostUsdMicros,
  };
}

// ── 응답 파싱 ────────────────────────────────────────────────
interface ParsedFunctionCall {
  callId: string;
  name: string;
  rawArguments: string;
}

/** Responses API output 에서 텍스트와 function call 을 추출한다. */
function parseResponseOutput(output: ResponseOutputItem[]): {
  text: string;
  functionCalls: ParsedFunctionCall[];
} {
  let text = "";
  const functionCalls: ParsedFunctionCall[] = [];

  for (const item of output ?? []) {
    if (item.type === "message") {
      for (const part of item.content ?? []) {
        if (part.type === "output_text") {
          text += part.text;
        }
      }
    } else if (item.type === "function_call") {
      functionCalls.push({
        callId: item.call_id,
        name: item.name,
        rawArguments: item.arguments ?? "",
      });
    }
  }

  return { text: text.trim(), functionCalls };
}

/** function call 인자(JSON 문자열)를 안전하게 파싱한다. */
function parseArgs(raw: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** function call 을 AgentUiAction 으로 변환한다. 알 수 없으면 null. */
function toUiAction(name: string, args: Record<string, unknown>): AgentUiAction | null {
  switch (name) {
    case "navigate":
      return { type: "navigate", route: String(args.route ?? "") };
    case "set_exam_title":
      return { type: "set_exam_title", text: String(args.text ?? "") };
    case "set_topic":
      return { type: "set_topic", text: String(args.text ?? "") };
    case "set_question_count":
      return {
        type: "set_question_count",
        count: Math.trunc(Number(args.count ?? 0)),
      };
    case "set_difficulty": {
      const d = args.difficulty;
      const difficulty =
        d === "basic" || d === "advanced" ? d : "intermediate";
      return { type: "set_difficulty", difficulty };
    }
    case "generate_questions":
      return { type: "generate_questions" };
    case "revise_question":
      return {
        type: "revise_question",
        index: Math.trunc(Number(args.index ?? 0)),
        instruction: String(args.instruction ?? ""),
      };
    case "add_question":
      return { type: "add_question" };
    case "remove_question":
      return {
        type: "remove_question",
        index: Math.trunc(Number(args.index ?? 0)),
      };
    default:
      return null;
  }
}

/** 액션 타입별 사람이 읽는 한 줄 요약 — tool_call 스텝 title 용. */
function describeUiAction(action: AgentUiAction): string {
  switch (action.type) {
    case "navigate":
      return `페이지 이동: ${action.route}`;
    case "set_exam_title":
      return `시험 제목 입력: ${action.text}`;
    case "set_topic":
      return `주제 입력: ${action.text}`;
    case "set_question_count":
      return `문항 수 설정: ${action.count}`;
    case "set_difficulty":
      return `난이도 설정: ${action.difficulty}`;
    case "generate_questions":
      return "문제 생성 시작";
    case "revise_question":
      return `문제 수정 (#${action.index})`;
    case "add_question":
      return "문제 추가";
    case "remove_question":
      return `문제 제거 (#${action.index})`;
  }
}

// ── 취소 처리 ────────────────────────────────────────────────
async function finishCancelled(runId: string): Promise<AgentTurnResponse> {
  await patchAgentRun(runId, {
    status: "cancelled",
    cancelRequested: false,
    pendingToolCalls: null,
    completedAt: new Date().toISOString(),
  });
  await appendAgentStep(runId, {
    stepType: "analysis",
    title: "작업 중단",
    content: "강사 요청으로 에이전트 작업을 중단했습니다.",
  });
  const record = await getAgentRun(runId);
  if (!record) throw new Error(`advanceAgentRun: agent_run disappeared: ${runId}`);
  return { run: toPublicRun(record), pendingActions: [], done: true };
}

// ── 공개 형태 변환 ───────────────────────────────────────────
/** 러너 내부 필드(lastResponseId, pendingToolCalls)를 제거. */
function toPublicRun(record: AgentRunRecord): AgentTurnResponse["run"] {
  const {
    lastResponseId: _lastResponseId,
    pendingToolCalls: _pendingToolCalls,
    cancelRequested: _cancelRequested,
    ...publicRun
  } = record;
  void _lastResponseId;
  void _pendingToolCalls;
  void _cancelRequested;
  return publicRun;
}

// ── 메인: 재개형 턴 진행 ─────────────────────────────────────
/**
 * 에이전트 루프를 한 턴 진행한다.
 *
 * @param runId  agent_runs.id
 * @param continuation  없으면 첫 턴, 있으면 재개 턴.
 * @returns AgentTurnResponse — { run, pendingActions, done, summary? }
 */
export async function advanceAgentRun(
  runId: string,
  continuation?: AgentTurnContinuation
): Promise<AgentTurnResponse> {
  // ── 1. 로드 ────────────────────────────────────────────────
  const initial = await getAgentRun(runId);
  if (!initial) {
    throw new Error(`advanceAgentRun: agent_run not found: ${runId}`);
  }

  const usage = {
    tokensUsed: initial.tokensUsed,
    costUsdMicros: initial.costUsdMicros,
  };

  try {
    // ── 2. 협조적 취소 확인 ──────────────────────────────────
    if (initial.cancelRequested) {
      return await finishCancelled(runId);
    }

    await patchAgentRun(runId, { status: "running", error: null });

    // ── 3. input 구성 (첫 턴 vs 재개 턴) ─────────────────────
    let input: string | ResponseInputItem[];
    let previousResponseId: string | null;
    const phase: "first_turn" | "resume_turn" = continuation
      ? "resume_turn"
      : "first_turn";

    if (continuation) {
      const pending = (initial.pendingToolCalls ?? []) as AgentUiActionEnvelope[];
      input = buildContinuationInput(pending, continuation);
      previousResponseId = initial.lastResponseId;
    } else {
      const prompt = initial.input?.prompt ?? "";
      if (prompt.trim().length === 0) {
        throw new Error("러너: 처리할 강사 지시문이 없습니다.");
      }
      // 첫 턴 pageState 는 라우트가 input.pageContext 가 아닌
      // StartAgentRunRequest.pageState 를 받아 첫 호출의 continuation 처럼
      // 넘기지 않는다 — 첫 턴은 continuation 이 undefined 이므로
      // pageState 를 input.pageContext 로부터 복원할 수 없다.
      // 대신 라우트가 첫 pageState 를 user_input 스텝 metadata 에 심어 둔다.
      const firstPageState = extractFirstPageState(initial);
      input = buildFirstTurnInput(prompt, firstPageState);
      previousResponseId = null;
    }

    // ── 4. LLM 호출 ──────────────────────────────────────────
    const { response, tokensUsed, costUsdMicros } = await callModel({
      input,
      previousResponseId,
      runId,
      userId: initial.actorId,
      phase,
    });
    usage.tokensUsed += tokensUsed;
    usage.costUsdMicros += costUsdMicros;

    const { text, functionCalls } = parseResponseOutput(response.output);

    // ── 5. 텍스트 → plan/analysis 스텝 ───────────────────────
    if (text) {
      const stepType = continuation ? "analysis" : "plan";
      await appendAgentStep(runId, {
        stepType,
        title: stepType === "plan" ? "작업 계획" : "분석",
        content: text,
      });
    }

    // ── 6. finish 검사 ───────────────────────────────────────
    const finishCall = functionCalls.find((c) => c.name === "finish");
    if (finishCall) {
      const args = parseArgs(finishCall.rawArguments);
      const summary =
        typeof args.summary === "string" && args.summary.trim().length > 0
          ? args.summary.trim()
          : "에이전트 작업을 완료했습니다.";
      await appendAgentStep(runId, {
        stepType: "final",
        title: "작업 완료",
        content: summary,
      });
      const completed = await patchAgentRun(runId, {
        status: "completed",
        pendingToolCalls: null,
        lastResponseId: response.id,
        tokensUsed: usage.tokensUsed,
        costUsdMicros: usage.costUsdMicros,
        completedAt: new Date().toISOString(),
      });
      return {
        run: toPublicRun(completed),
        pendingActions: [],
        done: true,
        summary,
      };
    }

    // ── 7. UI 액션 function call → pending envelopes ─────────
    const pendingActions: AgentUiActionEnvelope[] = [];
    for (const call of functionCalls) {
      if (!isAgentToolName(call.name) || call.name === "finish") {
        // 알 수 없는 툴 — 스텝으로만 남기고 건너뛴다.
        await appendAgentStep(runId, {
          stepType: "tool_call",
          title: `알 수 없는 액션 무시: ${call.name}`,
          content: `에이전트가 알 수 없는 액션 '${call.name}' 을 호출했습니다.`,
          metadata: { toolName: call.name },
        });
        continue;
      }
      const args = parseArgs(call.rawArguments);
      const action = toUiAction(call.name, args);
      if (!action) continue;
      pendingActions.push({ id: call.callId, action });
      await appendAgentStep(runId, {
        stepType: "tool_call",
        title: describeUiAction(action),
        content: `편집기에서 '${action.type}' 액션을 실행하도록 요청했습니다.`,
        metadata: { toolName: action.type, args },
      });
    }

    // ── 8. emit 한 액션이 없으면 → 모델이 더 할 일 없다고 판단 ──
    //      finish 도 액션도 없으면 루프가 멈출 곳이 없으므로 완료 처리.
    if (pendingActions.length === 0) {
      const summary =
        text || "에이전트가 더 진행할 작업을 찾지 못해 종료했습니다.";
      await appendAgentStep(runId, {
        stepType: "final",
        title: "작업 종료",
        content: summary,
      });
      const completed = await patchAgentRun(runId, {
        status: "completed",
        pendingToolCalls: null,
        lastResponseId: response.id,
        tokensUsed: usage.tokensUsed,
        costUsdMicros: usage.costUsdMicros,
        completedAt: new Date().toISOString(),
      });
      return {
        run: toPublicRun(completed),
        pendingActions: [],
        done: true,
        summary,
      };
    }

    // ── 9. pending 저장 + last_response_id 저장 → 턴 일시정지 ──
    const paused = await patchAgentRun(runId, {
      status: "running",
      pendingToolCalls: pendingActions,
      lastResponseId: response.id,
      tokensUsed: usage.tokensUsed,
      costUsdMicros: usage.costUsdMicros,
    });

    return {
      run: toPublicRun(paused),
      pendingActions,
      done: false,
    };
  } catch (error) {
    // ── 에이전트 수준 오류 → status=failed, throw 하지 않음 ──
    const message =
      error instanceof Error ? error.message : "알 수 없는 에이전트 오류";
    logError("advanceAgentRun failed", error, {
      path: AGENT_ROUTE,
      additionalData: { runId },
    });
    try {
      await patchAgentRun(runId, {
        status: "failed",
        error: message,
        pendingToolCalls: null,
        tokensUsed: usage.tokensUsed,
        costUsdMicros: usage.costUsdMicros,
        completedAt: new Date().toISOString(),
      });
    } catch (patchError) {
      logError("advanceAgentRun: failed to record failure", patchError, {
        path: AGENT_ROUTE,
        additionalData: { runId },
      });
    }
    const failedRecord = await getAgentRun(runId);
    if (!failedRecord) {
      throw new Error(`advanceAgentRun: agent_run disappeared: ${runId}`);
    }
    return {
      run: toPublicRun(failedRecord),
      pendingActions: [],
      done: true,
    };
  }
}

// ── 첫 턴 pageState 복원 ─────────────────────────────────────
/**
 * 첫 턴에는 continuation 이 없으므로 pageState 를 별도로 얻어야 한다.
 * 라우트(POST /api/agent/runs)가 첫 pageState 를 user_input 스텝의 metadata
 * 에 `pageState` 키로 심어 둔다. 없으면 input.pageContext 로 최소 복원한다.
 */
function extractFirstPageState(record: AgentRunRecord): AgentPageState {
  for (let i = record.steps.length - 1; i >= 0; i--) {
    const step = record.steps[i];
    if (step.stepType === "user_input" && step.metadata) {
      const candidate = step.metadata.pageState;
      if (isAgentPageState(candidate)) {
        return candidate;
      }
    }
  }
  // 폴백 — pageContext 의 route 만 알 수 있고 나머지는 빈 상태.
  return {
    route: record.input?.pageContext?.route ?? "/instructor",
    examTitle: "",
    questionCount: 0,
    questions: [],
    isGenerating: false,
  };
}

function isAgentPageState(value: unknown): value is AgentPageState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.route === "string" &&
    typeof v.examTitle === "string" &&
    typeof v.questionCount === "number" &&
    Array.isArray(v.questions) &&
    typeof v.isGenerating === "boolean"
  );
}
