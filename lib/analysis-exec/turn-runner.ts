/**
 * 분석 턴 하나를 끝까지 처리한다 (이슈 #545)
 *
 * `/api/chat/analysis` 가 인증, 소유권, 켜지는 조건을 확인한 뒤 SSE 스트림 안에서 부른다. 순서:
 *   1. 세션의 이전 분석 기록을 읽는다(마지막 기록의 컨테이너와 파일).
 *   2. 컨테이너를 준비한다. 만료면(또는 지난 복원이 덜 끝났으면) 새로 만들고 이전 상태를 되살린다
 *      (`environment_restarted`). 원래 셀들을 복원 파일로 올리고 모델은 그 파일을 여는 한 줄만 실행한다. 파일을 못
 *      올리면 모델이 코드를 다시 실행한다. 준비가 실패하면 아무것도 저장하지 않고 끝낸다(학생이 다시 보내면 된다).
 *   3. 학생 메시지를 저장한다(`/api/chat` 과 같은 모양).
 *   4. 지시문(`analysis-partner@2` 도구 있음)과 입력을 만들고 Responses 스트림을 돌린다. 입력 앞에는 developer
 *      메시지를 붙인다. 컨테이너를 새로 만들었으면 복구 지시 하나, 아니면 이 문항의 대화가 아직 모르는 코드를 알린다:
 *      다른 문항에서 실행한 코드(문항 간 연결)와 같은 문항에서 중단된 요청이 실행한 코드. 호출이
 *      `Container is expired` 로 실패하고 아직 셀이 없으면 한 번 복구해 다시 돌린다.
 *   5. 그림을 비공개 버킷에 올리고, 답변의 sandbox 링크를 지우고, AI 메시지를 저장한다. 실패한 턴도 실행한 셀이
 *      있으면 기록한다("코드는 전부 기록").
 *   6. ai_events 에 정확히 한 번 기록한다(feature `student_chat_analysis`).
 *   7. 화면에 done 또는 error 를 보낸다.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAiTextMetadata, recordAiStreamEvent } from "@/lib/ai-tracking";
import { assembleAnalysisToolInstructions } from "@/lib/chat-instructions";
import { classifyMessageType, type MessageType } from "@/lib/message-classification";
import { logError } from "@/lib/logger";
import {
  CURRENT_ANALYSIS_PARTNER_TOOLS_SPEC_ID,
  buildResponseModelStamp,
  buildStudentChatSpecStamp,
  type StudentChatSpecId,
} from "@/lib/student-chat-spec";
import type { AnalysisErrorCode, AnalysisStreamEvent } from "@/lib/analysis-exec/client-events";
import {
  REPLAY_FILE_NAME,
  applyPathRewrites,
  buildFileRestoreInstruction,
  buildInterruptedCodeInstruction,
  buildLinkedCodeInstruction,
  buildReplayInstruction,
  buildReplayScript,
  capCells,
  collectContainerHistory,
  collectUnseenCells,
  MAX_RESTORE_ATTEMPTS,
  ensureAnalysisContainer,
  historyPathRewrites,
  isReplayCellCode,
  parseReplayResult,
  restoreAttemptOf,
  restoreNeedsRetry,
  type CarriedCells,
  type ContainerOps,
  type EnsuredContainer,
} from "@/lib/analysis-exec/container";
import type { AnalysisDataSource } from "@/lib/analysis-exec/eligibility";
import { OpenAIHttpError } from "@/lib/analysis-exec/errors";
import {
  ANALYSIS_FINALIZE_DEADLINE_MS,
  ANALYSIS_MAX_OUTPUT_TOKENS,
  CITED_FIGURES_MIN_REMAINING_MS,
  MAX_FIGURE_BYTES,
  REPLAY_CODE_MAX_CHARS,
  REPLAY_FILE_MAX_CHARS,
} from "@/lib/analysis-exec/limits";
import {
  ANALYSIS_METADATA_VERSION,
  isSuccessfulOutcome,
  toClientAnalysisTurn,
  type AnalysisCellRef,
  type AnalysisNotice,
  type AnalysisOutcome,
  type AnalysisRestoreMode,
  type StoredAnalysisRestore,
  type StoredAnalysisTurn,
} from "@/lib/analysis-exec/metadata";
import {
  createContainer,
  downloadContainerFile,
  listContainerFiles,
  openResponseStream,
  retrieveContainer,
  uploadContainerFile,
  uploadFile,
  type OpenAIHttpConfig,
} from "@/lib/analysis-exec/openai-http";
import { buildStoredTurn, storeCellFigures, storeCitedFigures } from "@/lib/analysis-exec/persist";
import {
  createFigureStore,
  downloadDataSource,
  loadSessionAnalysisRecords,
  type SessionAnalysisRecord,
} from "@/lib/analysis-exec/session-records";
import { runStreamTurn, type StreamTurnResult } from "@/lib/analysis-exec/stream-turn";
import type { AiUsageSnapshot } from "@/lib/ai-pricing";
import { collectImageCitations, collectOutputText, stripSandboxLinks } from "@/lib/analysis-exec/text";

export const ANALYSIS_ROUTE = "/api/chat/analysis";

export type AnalysisTurnContext = {
  supabase: SupabaseClient;
  http: OpenAIHttpConfig;
  model: string;
  userId: string;
  sessionId: string;
  examId: string;
  qIdx: number;
  message: string;
  questionId?: string;
  examTitle?: string;
  examCode: string;
  currentQuestionText?: string;
  currentQuestionAiContext?: string;
  dataSources: AnalysisDataSource[];
  /** 요청 시작 시각. 240초 예산은 여기서부터 센다. */
  startedAtMs: number;
  /** 학생이 연결을 끊으면 취소된다. */
  clientSignal: AbortSignal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** `/api/chat` 과 같은 자료 검색 기록 키. 분석 턴은 자료 검색을 하지 않는다. */
const NO_RAG = { topSimilarity: null, resultsCount: 0, method: "none" } as const;

function bindContainerOps(ctx: AnalysisTurnContext): ContainerOps {
  const signal = ctx.clientSignal;
  return {
    createContainer: (p) => createContainer(ctx.http, { ...p, signal }),
    retrieveContainer: (p) => retrieveContainer(ctx.http, { ...p, signal }),
    listContainerFiles: (p) => listContainerFiles(ctx.http, { ...p, signal }),
    uploadFile: (p) => uploadFile(ctx.http, { ...p, signal }),
    uploadContainerFile: (p) => uploadContainerFile(ctx.http, { ...p, signal }),
    downloadDataSource: (source) => downloadDataSource(ctx.supabase, source),
  };
}

async function fetchPreviousResponseId(ctx: AnalysisTurnContext): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from("messages")
    .select("response_id")
    .eq("session_id", ctx.sessionId)
    .eq("q_idx", ctx.qIdx)
    .eq("role", "ai")
    .not("response_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    void logError("[chat-analysis] previous response_id lookup failed", error, { path: ANALYSIS_ROUTE });
  }
  return (data as { response_id?: string | null } | null)?.response_id ?? null;
}

async function insertUserMessage(ctx: AnalysisTurnContext): Promise<void> {
  const messageType: MessageType = await classifyMessageType(ctx.message).catch(() => "other" as MessageType);
  const payload = {
    session_id: ctx.sessionId,
    q_idx: ctx.qIdx,
    role: "user",
    content: ctx.message,
    message_type: messageType,
    metadata: { rag: { ...NO_RAG } },
  };
  const { error } = await ctx.supabase.from("messages").insert([payload]);
  if (error) {
    void logError("[chat-analysis] user message save failed — retrying once", error, { path: ANALYSIS_ROUTE });
    const { error: retryError } = await ctx.supabase
      .from("messages")
      .insert([{ ...payload, metadata: { ...payload.metadata, _retried: true } }]);
    if (retryError) {
      void logError("[chat-analysis] user message save failed twice", retryError, { path: ANALYSIS_ROUTE });
    }
  }
}

/** AI 메시지를 저장한다(한 번 다시 시도). 저장된 시각을 돌려준다. 두 번 다 실패하면 null. */
async function insertAiMessage(
  ctx: AnalysisTurnContext,
  row: Record<string, unknown>
): Promise<{ createdAt: string | null } | null> {
  const attempt = async (payload: Record<string, unknown>) => {
    try {
      const { data, error } = await ctx.supabase.from("messages").insert([payload]).select("id, created_at").maybeSingle();
      if (error) return { ok: false as const, error };
      return { ok: true as const, createdAt: (data as { created_at?: string } | null)?.created_at ?? null };
    } catch (error) {
      return { ok: false as const, error };
    }
  };
  const first = await attempt(row);
  if (first.ok) return { createdAt: first.createdAt };
  void logError("[chat-analysis] AI message save failed — retrying once", first.error, { path: ANALYSIS_ROUTE });
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const second = await attempt({ ...row, metadata: { ...metadata, _retried: true } });
  if (second.ok) return { createdAt: second.createdAt };
  void logError("[chat-analysis] AI message save failed twice", second.error, { path: ANALYSIS_ROUTE });
  return null;
}

function outcomeOf(result: StreamTurnResult): AnalysisOutcome {
  switch (result.outcome) {
    case "completed":
    case "incomplete":
    case "cell_limit":
    case "time_limit":
    case "client_cancelled":
      return result.outcome;
    default:
      if (result.failure?.kind === "quota_exhausted") return "quota_exhausted";
      if (result.failure?.kind === "rate_limited") return "rate_limited";
      return "upstream_error";
  }
}

export function errorCodeOf(outcome: AnalysisOutcome): AnalysisErrorCode {
  switch (outcome) {
    case "cell_limit":
    case "time_limit":
      return "limit_exceeded";
    case "quota_exhausted":
      return "quota_exhausted";
    case "rate_limited":
      return "rate_limited";
    default:
      return "failed";
  }
}

function eventStatusOf(outcome: AnalysisOutcome): "success" | "error" | "timeout" | "client_cancelled" {
  if (isSuccessfulOutcome(outcome)) return "success";
  if (outcome === "time_limit") return "timeout";
  if (outcome === "client_cancelled") return "client_cancelled";
  return "error";
}

/** 다른 기록에서 쓰지 않는 컨테이너면(이번에 처음 만든 경우) 복구 대상으로 쓸 가짜 이전 기록. */
function syntheticPrevious(ensured: EnsuredContainer): StoredAnalysisTurn {
  return {
    v: ANALYSIS_METADATA_VERSION,
    container_id: ensured.restarted && ensured.previousContainerId ? ensured.previousContainerId : ensured.containerId,
    files: ensured.files,
    sources: ensured.sources,
    cells: [],
    cited_figures: [],
    outcome: "completed",
    notices: [],
    elapsed_ms: 0,
  };
}

/** 같은 옛 경로를 두 번 바꾸지 않게 앞의 짝을 남긴다. */
function dedupeRewrites(rewrites: ReadonlyArray<{ from: string; to: string }>): Array<{ from: string; to: string }> {
  const seen = new Set<string>();
  return rewrites.filter((r) => (seen.has(r.from) ? false : (seen.add(r.from), true)));
}

/** 컨테이너를 새로 만든 턴의 복원 계획. */
type RestorePlan = {
  mode: AnalysisRestoreMode;
  /** 되살린 이력의 출처(원래 셀). */
  refs: AnalysisCellRef[];
  /** 입력 앞에 붙일 복구 지시. */
  text: string | null;
  /** 복원 파일(file)이나 지시문(inline)에 넣은 셀 수. */
  cells: number;
  /** 같은 이력의 몇 번째 복원인가(처음 1, 다시 복원 2). */
  attempt: number;
};

/**
 * 새 컨테이너에 이전 상태를 되살릴 준비를 한다. 이전 컨테이너의 이력(원래 셀)을 모아 경로를 바꿔 넣고 복원 파일로
 * 컨테이너에 올린다. 올리지 못하면(또는 경로를 알 수 없으면) 모델이 코드를 다시 실행하는 지시로 물러난다. 되살릴 셀이
 * 없으면 null. 학생이 연결을 끊은 경우에만 던진다.
 */
async function prepareRestore(params: {
  ops: ContainerOps;
  records: ReadonlyArray<SessionAnalysisRecord>;
  ensured: EnsuredContainer;
  qIdx: number;
  clientSignal: AbortSignal;
  attempt: number;
}): Promise<RestorePlan | null> {
  const { ops, records, ensured } = params;
  if (!ensured.previousContainerId) return null;
  const history = collectContainerHistory(records, ensured.previousContainerId);
  if (history.length === 0) return null;
  // 파일을 다시 올려 경로가 바뀌었으면 이전 코드 안의 옛 경로(여러 세대 전 것 포함)를 새 경로로 바꿔 넣는다.
  const rewrites = dedupeRewrites([...ensured.pathRewrites, ...historyPathRewrites(records, ensured.files)]);
  const cells = history.map(({ qIdx, code }) => ({ qIdx, code: applyPathRewrites(code, rewrites) }));
  const refs = history.map((h) => h.ref);

  const inFile = capCells(cells, REPLAY_FILE_MAX_CHARS);
  try {
    const script = buildReplayScript(inFile.cells);
    const uploaded = await ops.uploadContainerFile({
      containerId: ensured.containerId,
      filename: REPLAY_FILE_NAME,
      bytes: new TextEncoder().encode(script),
      mime: "text/x-python",
    });
    let path = uploaded.path;
    if (!path && uploaded.id) {
      const listed = await ops.listContainerFiles({ containerId: ensured.containerId }).catch(() => []);
      path = listed.find((f) => f.id === uploaded.id)?.path ?? null;
    }
    if (!path) throw new Error("replay file path is unknown");
    return {
      mode: "file",
      refs,
      text: buildFileRestoreInstruction({
        path,
        reference: capCells(inFile.cells, REPLAY_CODE_MAX_CHARS),
        omittedFromFile: inFile.omitted,
        currentQIdx: params.qIdx,
      }),
      cells: inFile.cells.length,
      attempt: params.attempt,
    };
  } catch (error) {
    if (params.clientSignal.aborted) throw error;
    void logError("[chat-analysis] replay file upload failed — falling back to inline replay", error, {
      path: ANALYSIS_ROUTE,
    });
    const inline = capCells(cells, REPLAY_CODE_MAX_CHARS);
    return {
      mode: "inline",
      refs,
      text: buildReplayInstruction({ ...inline, currentQIdx: params.qIdx }),
      cells: inline.cells.length,
      attempt: params.attempt,
    };
  }
}

/**
 * 복원이 끝났는가. 파일 방식은 복원 셀의 결과 줄로 판단한다(끝까지 돌았는지, 실패한 셀이 있는지). 모델이 코드를 다시
 * 쓰는 방식은 턴이 정상으로 끝났을 때만 끝난 것으로 본다. 끝나지 않았으면 다음 턴에 새 컨테이너로 다시 복원한다.
 */
function restoreOutcome(
  plan: RestorePlan,
  cells: ReadonlyArray<{ code: string; status: string; logs: string }>,
  outcome: AnalysisOutcome
): StoredAnalysisRestore {
  const base = { refs: plan.refs, mode: plan.mode, ...(plan.attempt > 1 ? { attempt: plan.attempt } : {}) };
  if (plan.mode === "file") {
    const replayCell = cells.find((cell) => isReplayCellCode(cell.code));
    const parsed = replayCell && replayCell.status === "completed" ? parseReplayResult(replayCell.logs) : null;
    if (!parsed) return { ...base, status: "incomplete" };
    return { ...base, status: parsed.failed > 0 ? "partial" : "ok", ok_cells: parsed.ok, failed_cells: parsed.failed };
  }
  return { ...base, status: outcome === "completed" ? "ok" : "incomplete" };
}

/**
 * 컨테이너를 그대로 쓰는 턴의 developer 메시지들. 이 문항의 대화가 아직 모르는, 이 컨테이너에서 실행된 코드다.
 *   - 문항 간 연결: 다른 문항에서 실행한 코드.
 *   - 중단된 요청: 같은 문항에서 앞선 요청이 끝나기 전에 실행한 코드(그 요청은 대화에 이어지지 않는다).
 * 같은 문항에서 이어지는 성공 턴은 둘 다 없다(기존 대화 그대로).
 */
function unseenContextFor(
  records: ReadonlyArray<SessionAnalysisRecord>,
  ensured: EnsuredContainer,
  qIdx: number
): { texts: string[]; linkedCells: number; interruptedCells: number } {
  const rewrites = historyPathRewrites(records, ensured.files);
  const rewrite = (carried: CarriedCells): CarriedCells => ({
    cells: carried.cells.map((cell) => ({ ...cell, code: applyPathRewrites(cell.code, rewrites) })),
    omitted: carried.omitted,
  });
  const unseen = collectUnseenCells(records, { containerId: ensured.containerId, qIdx });
  const linked = rewrite(unseen.linked);
  const interrupted = rewrite(unseen.interrupted);
  const texts = [
    buildLinkedCodeInstruction({ ...linked, currentQIdx: qIdx }),
    buildInterruptedCodeInstruction({ ...interrupted, currentQIdx: qIdx }),
  ].filter((text): text is string => text !== null);
  return { texts, linkedCells: linked.cells.length, interruptedCells: interrupted.cells.length };
}

/** 복구로 두 번 호출했으면 두 호출의 사용량을 더한다(비용 기록이 빠지지 않게). */
function addUsage(a: AiUsageSnapshot | null, b: AiUsageSnapshot | null): AiUsageSnapshot | null {
  if (!a) return b;
  if (!b) return a;
  const sum = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return {
    inputTokens: sum(a.inputTokens, b.inputTokens),
    outputTokens: sum(a.outputTokens, b.outputTokens),
    cachedInputTokens: sum(a.cachedInputTokens, b.cachedInputTokens),
    reasoningTokens: sum(a.reasoningTokens, b.reasoningTokens),
    totalTokens: sum(a.totalTokens, b.totalTokens),
  };
}

/**
 * 분석 턴을 처리하고 화면 이벤트를 `send` 로 보낸다. 던지지 않는다(예상하지 못한 오류도 error 이벤트로 끝낸다).
 */
export async function runAnalysisTurn(ctx: AnalysisTurnContext, send: (event: AnalysisStreamEvent) => void): Promise<void> {
  const now = ctx.now ?? Date.now;
  let eventRecorded = false;
  let instructionsForLog: string | null = null;
  // 지시문을 만든 스펙. 조립 전(컨테이너 준비 실패)에는 도구 있음 포인터의 값이다.
  let specId: StudentChatSpecId = CURRENT_ANALYSIS_PARTNER_TOOLS_SPEC_ID;

  const recordEvent = async (params: {
    status: "success" | "error" | "timeout" | "client_cancelled";
    error?: unknown;
    result?: StreamTurnResult | null;
    metadata?: Record<string, unknown>;
    outputText?: string | null;
    /** 결과가 없을 때(준비 실패) 기록할 사용량. */
    usage?: AiUsageSnapshot | null;
  }) => {
    if (eventRecorded) return;
    eventRecorded = true;
    const specStamp = buildStudentChatSpecStamp({ specId, language: "ko", tools: "hosted_python" });
    await recordAiStreamEvent({
      context: {
        feature: "student_chat_analysis",
        route: ANALYSIS_ROUTE,
        model: ctx.model,
        userId: ctx.userId,
        examId: ctx.examId,
        sessionId: ctx.sessionId,
        qIdx: ctx.qIdx,
        metadata: buildAiTextMetadata({
          inputText: instructionsForLog ? [instructionsForLog, ctx.message] : [ctx.message],
          outputText: params.outputText ?? null,
          extra: {
            ...specStamp,
            ...(params.result ? buildResponseModelStamp({ model: params.result.responseModel }, ctx.model) : {}),
            ...(params.metadata ?? {}),
          },
        }),
      },
      status: params.status,
      latencyMs: now() - ctx.startedAtMs,
      usage: params.result?.usage ?? params.usage ?? null,
      responseId: params.result?.responseId ?? null,
      error: params.error,
    });
  };

  try {
    send({ event: "status", data: { phase: "preparing" } });

    let records: SessionAnalysisRecord[] = [];
    try {
      records = await loadSessionAnalysisRecords(ctx.supabase, ctx.sessionId);
    } catch (error) {
      // 이전 기록을 못 읽으면 새 컨테이너로 시작한다(이전 변수는 없다). 학생 응답을 막지 않는다.
      void logError("[chat-analysis] previous analysis records lookup failed", error, { path: ANALYSIS_ROUTE });
    }
    const previous = records.length > 0 ? records[records.length - 1].turn : null;
    // 지난 턴이 이 컨테이너로 복원을 시작했는데 덜 끝났으면(복원 셀이 끝까지 돌지 못함) 새 컨테이너로 다시 복원한다.
    const retryRestore = previous ? restoreNeedsRetry(records, previous.container_id) : false;
    // 이번 복원이 같은 이력의 몇 번째 시도인가. 다시 복원은 한 번뿐이다(`MAX_RESTORE_ATTEMPTS`).
    const restoreAttempt = retryRestore && previous ? restoreAttemptOf(records, previous.container_id) + 1 : 1;
    const ops = bindContainerOps(ctx);

    // 만료 복구 전 호출의 사용량(비용). 복구 중 실패해도 기록에 넣는다.
    let earlierUsage: AiUsageSnapshot | null = null;

    const setupFailed = async (error: unknown) => {
      const quota = error instanceof OpenAIHttpError && error.kind === "quota_exhausted";
      void logError(
        quota ? "[chat-analysis] OpenAI credit exhausted (container setup)" : "[chat-analysis] analysis container setup failed",
        error,
        { path: ANALYSIS_ROUTE, user_id: ctx.userId, additionalData: { sessionId: ctx.sessionId } }
      );
      await recordEvent({
        status: "error",
        // ai_events.error_code 에 오류 종류가 남도록 이름을 붙인다(`OpenAIHttpError` 라는 클래스 이름은 쓸모가 없다).
        error: Object.assign(new Error(error instanceof Error ? error.message : String(error)), {
          name:
            error instanceof OpenAIHttpError
              ? (error.code ?? error.kind)
              : error instanceof Error
                ? error.name
                : "setup_failed",
        }),
        metadata: { analysis_outcome: quota ? "quota_exhausted" : "setup_failed" },
        usage: earlierUsage,
      });
      send({ event: "error", data: { code: quota ? "quota_exhausted" : "tool_unavailable" } });
    };

    const cancelledDuringSetup = async () => {
      // 준비 중에 학생이 연결을 끊었다. 컨테이너와 파일 API 는 이미 불렀으므로 이벤트는 남긴다.
      await recordEvent({
        status: "client_cancelled",
        metadata: { analysis_outcome: "client_cancelled_setup" },
        usage: earlierUsage,
      });
    };

    let ensured: EnsuredContainer;
    // 컨테이너를 새로 만든 턴의 복원 계획과 그 컨테이너.
    let plan: RestorePlan | null = null;
    let planFor: string | null = null;
    try {
      ensured = await ensureAnalysisContainer(ops, {
        sessionId: ctx.sessionId,
        previous,
        dataSources: ctx.dataSources,
        forceNew: retryRestore,
      });
      if (ensured.restarted) {
        send({ event: "status", data: { phase: "restarting" } });
        plan = await prepareRestore({
          ops,
          records,
          ensured,
          qIdx: ctx.qIdx,
          clientSignal: ctx.clientSignal,
          attempt: restoreAttempt,
        });
        planFor = ensured.containerId;
      }
    } catch (error) {
      if (ctx.clientSignal.aborted) {
        await cancelledDuringSetup();
        return;
      }
      await setupFailed(error);
      return;
    }

    await insertUserMessage(ctx);
    const previousResponseId = await fetchPreviousResponseId(ctx);

    let restartedAny = ensured.restarted;
    let replayedCells = 0;
    let linkedCells = 0;
    let interruptedCells = 0;
    let attempts = 0;
    let result: StreamTurnResult;

    while (true) {
      attempts += 1;
      const assembled = assembleAnalysisToolInstructions({
        examTitle: ctx.examTitle,
        examCode: ctx.examCode,
        questionId: ctx.questionId,
        currentQuestionText: ctx.currentQuestionText,
        currentQuestionAiContext: ctx.currentQuestionAiContext,
        dataFiles: ensured.files.map((f) => ({ path: f.path, name: f.name })),
      });
      const instructions = assembled.instructions;
      specId = assembled.specId;
      instructionsForLog = instructions;
      // 컨테이너를 새로 만들었으면 복구 지시만(문항 간 연결과 중단된 요청의 코드도 복원 이력에 들어 있다).
      // 아니면 이 문항의 대화가 아직 모르는 코드를 알린다.
      let developerTexts: string[];
      if (ensured.restarted) {
        developerTexts = plan?.text ? [plan.text] : [];
        replayedCells = plan?.cells ?? 0;
        linkedCells = 0;
        interruptedCells = 0;
      } else {
        const unseen = unseenContextFor(records, ensured, ctx.qIdx);
        developerTexts = unseen.texts;
        replayedCells = 0;
        linkedCells = unseen.linkedCells;
        interruptedCells = unseen.interruptedCells;
      }
      const input =
        developerTexts.length > 0
          ? [
              ...developerTexts.map((content) => ({ role: "developer", content })),
              { role: "user", content: ctx.message },
            ]
          : ctx.message;

      const body: Record<string, unknown> = {
        model: ctx.model,
        instructions,
        input,
        ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
        store: true,
        tools: [{ type: "code_interpreter", container: ensured.containerId }],
        tool_choice: "auto",
        include: ["code_interpreter_call.outputs"],
        max_output_tokens: ANALYSIS_MAX_OUTPUT_TOKENS,
      };

      result = await runStreamTurn({
        open: (signal) => openResponseStream(ctx.http, { body, signal }),
        clientSignal: ctx.clientSignal,
        startedAtMs: ctx.startedAtMs,
        now: ctx.now,
        sleep: ctx.sleep,
        callbacks: {
          onCellStarted: (n) => send({ event: "status", data: { phase: "running", cell: n } }),
          onWriting: () => send({ event: "status", data: { phase: "writing" } }),
          onTextDelta: (delta) => send({ event: "text", data: { delta } }),
        },
      });

      const expired = result.failure?.kind === "container_expired" && result.cells.length === 0;
      if (!expired || attempts >= 2) break;
      earlierUsage = addUsage(earlierUsage, result.usage);

      // 조회와 호출 사이에 만료됐다. 새 컨테이너를 만들고 이전 상태를 되살려 한 번만 다시 돈다.
      try {
        ensured = await ensureAnalysisContainer(ops, {
          sessionId: ctx.sessionId,
          previous: syntheticPrevious(ensured),
          dataSources: ctx.dataSources,
          forceNew: true,
        });
        send({ event: "status", data: { phase: "restarting" } });
        if (planFor !== ensured.containerId) {
          plan = await prepareRestore({
            ops,
            records,
            ensured,
            qIdx: ctx.qIdx,
            clientSignal: ctx.clientSignal,
            attempt: restoreAttempt,
          });
          planFor = ensured.containerId;
        }
      } catch (error) {
        if (ctx.clientSignal.aborted) {
          await cancelledDuringSetup();
          return;
        }
        await setupFailed(error);
        return;
      }
      restartedAny = true;
    }

    if (earlierUsage) result = { ...result, usage: addUsage(earlierUsage, result.usage) };
    const outcome = outcomeOf(result);
    if (result.failure) {
      void logError(
        outcome === "quota_exhausted" ? "[chat-analysis] OpenAI credit exhausted" : "[chat-analysis] analysis turn failed",
        new Error(result.failure.message),
        {
          path: ANALYSIS_ROUTE,
          user_id: ctx.userId,
          additionalData: { sessionId: ctx.sessionId, kind: result.failure.kind, code: result.failure.code, outcome },
        }
      );
    }

    // 저장
    const messageId = randomUUID();
    // 스트림 뒤 작업(그림 저장, 인용 그림 내려받기)에도 마감을 둔다. 함수 시간(300초)에 죽으면 AI 메시지와
    // ai_events 가 모두 사라지므로, 마감이 지나면 그림을 버리고 저장으로 넘어간다.
    const finalizeDeadline = ctx.startedAtMs + ANALYSIS_FINALIZE_DEADLINE_MS;
    const remainingMs = () => finalizeDeadline - now();
    const store = createFigureStore(
      ctx.supabase,
      (path, error) => {
        void logError("[chat-analysis] figure upload failed", error, { path: ANALYSIS_ROUTE, additionalData: { figurePath: path } });
      },
      remainingMs
    );
    const restore = ensured.restarted && plan ? restoreOutcome(plan, result.cells, outcome) : null;
    // 복원 파일을 실행한 셀은 표시해 둔다. 다음 복원과 문항 간 연결은 이 셀 대신 원래 셀을 쓴다.
    const storedCells = (await storeCellFigures({ store, sessionId: ctx.sessionId, messageId, cells: result.cells })).map(
      (cell) => (restore?.mode === "file" && isReplayCellCode(cell.code) ? { ...cell, replay: true as const } : cell)
    );
    // 파일 인용 그림은 이 턴의 컨테이너 것만 내려받는다. 같은 조직 키로는 다른 컨테이너의 파일도 받을 수 있으므로
    // 인용이 가리키는 컨테이너를 믿지 않는다.
    const turnContainerId = ensured.containerId;
    const citations =
      isSuccessfulOutcome(outcome) && remainingMs() > CITED_FIGURES_MIN_REMAINING_MS
        ? collectImageCitations(result.finalOutput).filter((c) => c.containerId === turnContainerId)
        : [];
    const turnResult = result;
    const citedFigures =
      citations.length > 0
        ? await storeCitedFigures({
            store,
            sessionId: ctx.sessionId,
            messageId,
            citations,
            download: (c) =>
              remainingMs() > CITED_FIGURES_MIN_REMAINING_MS
                ? downloadContainerFile(ctx.http, {
                    containerId: c.containerId,
                    fileId: c.fileId,
                    maxBytes: MAX_FIGURE_BYTES,
                    timeoutMs: Math.min(15_000, remainingMs() - CITED_FIGURES_MIN_REMAINING_MS / 2),
                  })
                : Promise.resolve(null),
            knownHashes: turnResult.collector.figureHashes(),
            takeSlot: () => turnResult.collector.takeFigureSlot(),
          })
        : [];

    const rawText = result.finalOutput ? collectOutputText(result.finalOutput) : result.streamedText;
    const content = stripSandboxLinks(rawText);
    // 다시 복원까지 끝내지 못했으면 더는 복원하지 않는다. 학생에게 필요한 단계를 다시 요청하라고 알린다.
    const restoreAbandoned = restore?.status === "incomplete" && (restore.attempt ?? 1) >= MAX_RESTORE_ATTEMPTS;
    const notices: AnalysisNotice[] = [
      ...(restartedAny ? (["environment_restarted"] as const) : []),
      ...(restoreAbandoned ? (["restore_abandoned"] as const) : []),
    ];
    const storedTurn = buildStoredTurn({
      containerId: ensured.containerId,
      files: ensured.files,
      sources: ensured.sources,
      cells: storedCells,
      citedFigures,
      outcome,
      notices,
      replayedCells,
      linkedCells,
      interruptedCells,
      ...(restore ? { restore } : {}),
      elapsedMs: now() - ctx.startedAtMs,
    });

    const specStamp = buildStudentChatSpecStamp({ specId, language: "ko", tools: "hosted_python" });
    const shouldSave = isSuccessfulOutcome(outcome) || storedCells.length > 0;
    let timestamp = new Date(now()).toISOString();
    let saved = false;
    if (shouldSave) {
      const usage = result.usage;
      const inserted = await insertAiMessage(ctx, {
        id: messageId,
        session_id: ctx.sessionId,
        q_idx: ctx.qIdx,
        role: "ai",
        content,
        // 실패한 턴은 이어 쓰지 않는다. 다음 턴은 마지막 성공 응답에서 잇는다.
        response_id: isSuccessfulOutcome(outcome) ? result.responseId : null,
        tokens_used: usage?.totalTokens ?? null,
        metadata: {
          rag: { ...NO_RAG },
          usage: usage
            ? {
                input_tokens: usage.inputTokens,
                output_tokens: usage.outputTokens,
                total_tokens: usage.totalTokens,
                cached_input_tokens: usage.cachedInputTokens,
                reasoning_tokens: usage.reasoningTokens,
              }
            : {},
          ...specStamp,
          ...buildResponseModelStamp({ model: result.responseModel }, ctx.model),
          analysis: storedTurn,
        },
      });
      if (inserted) {
        saved = true;
        if (inserted.createdAt) timestamp = inserted.createdAt;
        const { error } = await ctx.supabase.rpc("increment_used_clarifications", {
          p_session_id: ctx.sessionId,
          p_amount: 1,
        });
        if (error) void logError("[chat-analysis] used_clarifications increment failed", error, { path: ANALYSIS_ROUTE });
      }
    }

    await recordEvent({
      status: eventStatusOf(outcome),
      error: isSuccessfulOutcome(outcome)
        ? undefined
        : Object.assign(new Error(result.failure?.message ?? outcome), {
            name: result.failure?.code ?? (outcome === "cell_limit" || outcome === "time_limit" ? `analysis_${outcome}` : outcome),
          }),
      result,
      outputText: content,
      metadata: {
        analysis_outcome: outcome,
        cells: storedCells.length,
        figures: storedCells.reduce((n, c) => n + c.figures.length, 0) + citedFigures.length,
        container_restarted: restartedAny,
        replayed_cells: replayedCells,
        linked_cells: linkedCells,
        interrupted_cells: interruptedCells,
        ...(restore ? { restore_mode: restore.mode, restore_status: restore.status } : {}),
        restore_retry: retryRestore,
        ...(restore ? { restore_attempt: restore.attempt ?? 1 } : {}),
        ...(restoreAbandoned ? { restore_abandoned: true } : {}),
        rate_limit_retries: result.retries,
        ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
        message_saved: saved,
      },
    });

    if (outcome === "client_cancelled") return;
    const message = saved
      ? { content, timestamp, analysis: toClientAnalysisTurn({ sessionId: ctx.sessionId, messageId, turn: storedTurn }) }
      : undefined;
    if (isSuccessfulOutcome(outcome) && message) {
      send({ event: "done", data: { message } });
    } else {
      send({
        event: "error",
        data: { code: isSuccessfulOutcome(outcome) ? "failed" : errorCodeOf(outcome), ...(message ? { message } : {}) },
      });
    }
  } catch (error) {
    void logError("[chat-analysis] unexpected error", error, { path: ANALYSIS_ROUTE, user_id: ctx.userId });
    await recordEvent({ status: "error", error, metadata: { analysis_outcome: "unexpected_error" } }).catch(() => undefined);
    send({ event: "error", data: { code: "failed" } });
  }
}
