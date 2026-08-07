"use client";

/**
 * AgentRunController — 강사 AI 에이전트의 클라이언트 실행 레이어 오케스트레이터.
 *
 * 서버 에이전트("두뇌")가 emit 한 UI 액션 배치를 실제 시험 편집기("손")에서
 * 실행하고, 그 결과를 다시 서버에 보고해 재개형 루프를 구동한다.
 *
 * ─────────────────────────────────────────────────────────────────────
 * 흐름:
 *   1. startRun(prompt) → 등록된 executor 로 현재 pageState 취득
 *   2. startAgentRun({prompt, pageState}) → 첫 AgentTurnResponse
 *   3. 루프: pendingActions 가 있고 done 이 아니면
 *        - 각 액션 실행 (navigate 는 컨트롤러가 직접, 나머지는 executor 위임)
 *        - submitAgentActionResults(runId, {results, pageState})
 *        - 다음 응답으로 반복
 *   4. done=true → phase 갱신 (done / failed / cancelled)
 *
 * navigate 핸드오프:
 *   navigate 액션은 컨트롤러가 useRouter().push 로 직접 처리한다.
 *   한 배치에 [navigate, set_title, ...] 가 같이 오면 navigate 를 먼저 실행하고,
 *   새 페이지의 편집기가 executor 를 재등록할 때까지 대기한 뒤 나머지를 실행한다.
 *
 * executor 등록:
 *   편집기 페이지가 마운트되면서 registerExecutor 로 자기 자신을 등록한다.
 *   페이지 이동/언마운트 시 registerExecutor(null) 로 해제한다. 컨트롤러는
 *   레이아웃에 마운트되어 네비게이션해도 살아 있으므로, 루프 상태가 유지된다.
 *
 * 마운트: 강사 레이아웃(app/(app)/instructor/layout.tsx) — 패널·편집기 상위.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  cancelAgentRun,
  startAgentRun,
  submitAgentActionResults,
} from "@/lib/agent/client";
import type { AgentRun } from "@/lib/agent/types";
import { safeAgentRoute } from "@/lib/agent/navigate-guard";
import type {
  AgentPageState,
  AgentTurnResponse,
  AgentUiAction,
  AgentUiActionEnvelope,
  AgentUiActionResult,
} from "@/lib/agent/ui-actions";

/** 루프 단계 — 외부(패널/편집기)가 보는 상태. */
export type AgentRunPhase =
  | "idle"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

/**
 * 편집기 페이지가 컨트롤러에 등록하는 실행기.
 * 편집기 액션(제목/주제/생성 등)을 실제 핸들러 + 체화 애니메이션으로 실행하고,
 * 현재 편집기 상태를 AgentPageState 로 보고한다.
 */
export interface AgentEditorExecutor {
  /** 한 UI 액션을 실행. navigate 는 컨트롤러가 처리하므로 여기 오지 않는다. */
  executeAction: (
    action: AgentUiAction,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** 현재 편집기 상태 스냅샷. */
  getPageState: () => AgentPageState;
}

/** useAgentRunController() 가 노출하는 외부 API. */
export interface AgentRunControllerApi {
  /** 진행/완료된 런. 없으면 null. */
  activeRun: AgentRun | null;
  /** 루프 단계. */
  phase: AgentRunPhase;
  /** 종료 시 에이전트의 마무리 요약. */
  summary: string | null;
  /** 새 런 시작 — pageState 취득 → startAgentRun → 루프 구동. */
  startRun: (prompt: string) => Promise<void>;
  /** 진행 중 런 협조적 취소. */
  cancelRun: () => void;
  /** idle 로 되돌림(완료/실패/취소 후 새 작업 준비). */
  reset: () => void;
  // ── 내부 API (편집기 페이지 전용) ──────────────────────────────
  /** 편집기 executor 등록/해제. null 이면 해제. */
  registerExecutor: (executor: AgentEditorExecutor | null) => void;
}

const AgentRunControllerContext = createContext<AgentRunControllerApi | null>(
  null,
);

/** executor 가 등록될 때까지 폴링 대기. */
const EXECUTOR_WAIT_POLL_MS = 80;
/** executor 등록 대기 최대 시간 (네비게이션 후 편집기 마운트 여유). */
const EXECUTOR_WAIT_TIMEOUT_MS = 8000;
/** navigate 후 라우트가 실제로 바뀔 때까지의 추가 안정화 대기. */
const NAVIGATE_SETTLE_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** executor 없을 때 보고용 최소 pageState (예: 편집기 밖에서 startRun). */
function fallbackPageState(route: string): AgentPageState {
  return {
    route,
    examTitle: "",
    questionCount: 0,
    questions: [],
    isGenerating: false,
  };
}

export interface AgentRunControllerProviderProps {
  children: ReactNode;
}

export function AgentRunControllerProvider({
  children,
}: AgentRunControllerProviderProps) {
  const router = useRouter();
  const t = useTranslations("admin.agent");

  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [phase, setPhase] = useState<AgentRunPhase>("idle");
  const [summary, setSummary] = useState<string | null>(null);

  /** 현재 등록된 편집기 executor. ref 라 루프가 항상 최신 값을 읽는다. */
  const executorRef = useRef<AgentEditorExecutor | null>(null);
  /** 진행 중 런 id — cancelRun / 루프가 참조. */
  const runIdRef = useRef<string | null>(null);
  /** 강사가 취소를 요청했는지 — 루프가 다음 체크포인트에서 멈춘다. */
  const cancelRequestedRef = useRef(false);
  /** 루프 중복 구동 방지. */
  const loopRunningRef = useRef(false);

  const registerExecutor = useCallback(
    (executor: AgentEditorExecutor | null) => {
      executorRef.current = executor;
    },
    [],
  );

  /** 현재 pageState 취득 — executor 가 있으면 그 스냅샷, 없으면 fallback. */
  const readPageState = useCallback((): AgentPageState => {
    const executor = executorRef.current;
    if (executor) return executor.getPageState();
    const route =
      typeof window !== "undefined" ? window.location.pathname : "";
    return fallbackPageState(route);
  }, []);

  /**
   * executor 가 등록될 때까지 대기. 타임아웃 시 null 반환.
   * navigate 직후 새 편집기 페이지가 마운트되며 executor 를 재등록하는 것을 기다린다.
   */
  const waitForExecutor =
    useCallback(async (): Promise<AgentEditorExecutor | null> => {
      const deadline = Date.now() + EXECUTOR_WAIT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (cancelRequestedRef.current) return executorRef.current;
        if (executorRef.current) return executorRef.current;
        await sleep(EXECUTOR_WAIT_POLL_MS);
      }
      return executorRef.current;
    }, []);

  /**
   * 액션 한 배치를 실행한다.
   * navigate 는 컨트롤러가 직접 처리하고, navigate 가 있으면 그 뒤 액션을
   * 실행하기 전 새 페이지의 executor 가 등록될 때까지 대기한다.
   */
  const runActionBatch = useCallback(
    async (
      envelopes: AgentUiActionEnvelope[],
    ): Promise<AgentUiActionResult[]> => {
      const results: AgentUiActionResult[] = [];

      for (const envelope of envelopes) {
        if (cancelRequestedRef.current) {
          results.push({
            id: envelope.id,
            ok: false,
            error: t("errors.cancelledByInstructor"),
          });
          continue;
        }

        const { action } = envelope;

        // ── navigate — 컨트롤러가 직접 처리 ──────────────────────
        if (action.type === "navigate") {
          try {
            // route 는 모델이 만든 문자열이다. 검증 없이 router.push 하면
            // javascript: 실행이나 외부 이동으로 이어진다 (이슈 #101).
            const route = safeAgentRoute(action.route);
            if (!route) {
              results.push({
                id: envelope.id,
                ok: false,
                error: t("errors.navigateFailed"),
              });
              continue;
            }
            const alreadyThere =
              typeof window !== "undefined" &&
              window.location.pathname === route;
            if (!alreadyThere) {
              // 새 페이지가 마운트되며 기존 executor 가 떨어져 나가는 것을
              // 명시적으로 표시 — 다음 편집기 액션은 재등록을 기다린다.
              executorRef.current = null;
              router.push(route);
              await sleep(NAVIGATE_SETTLE_MS);
            }
            results.push({ id: envelope.id, ok: true });
          } catch (err) {
            results.push({
              id: envelope.id,
              ok: false,
              error:
                err instanceof Error
                  ? err.message
                  : t("errors.navigateFailed"),
            });
          }
          continue;
        }

        // ── 그 외 — 편집기 executor 에 위임 ──────────────────────
        let executor = executorRef.current;
        if (!executor) {
          // navigate 직후거나 편집기가 아직 마운트되지 않음 → 대기.
          executor = await waitForExecutor();
        }
        if (!executor) {
          results.push({
            id: envelope.id,
            ok: false,
            error: t("errors.editorNotReady"),
          });
          continue;
        }

        try {
          const outcome = await executor.executeAction(action);
          results.push({
            id: envelope.id,
            ok: outcome.ok,
            ...(outcome.error ? { error: outcome.error } : {}),
          });
        } catch (err) {
          results.push({
            id: envelope.id,
            ok: false,
            error:
              err instanceof Error
                ? err.message
                : t("errors.actionFailed"),
          });
        }
      }

      return results;
    },
    [router, waitForExecutor],
  );

  /**
   * 재개형 루프 — done 까지 액션 배치를 실행하고 결과를 보고한다.
   * @param first startAgentRun 의 첫 응답.
   */
  const drive = useCallback(
    async (first: AgentTurnResponse) => {
      if (loopRunningRef.current) return;
      loopRunningRef.current = true;

      let turn = first;
      try {
        // 루프: done 이 아니고 실행할 액션이 있으면 계속.
        while (!turn.done && turn.pendingActions.length > 0) {
          if (cancelRequestedRef.current) break;

          const results = await runActionBatch(turn.pendingActions);

          if (cancelRequestedRef.current) break;

          const runId = runIdRef.current;
          if (!runId) break;

          // 액션 실행 후의 최신 페이지 상태를 동봉해 루프 재개.
          const next = await submitAgentActionResults(runId, {
            results,
            pageState: readPageState(),
          });
          turn = next;
          setActiveRun(next.run);
        }

        // 루프 종료 — 단계 확정.
        if (cancelRequestedRef.current) {
          setPhase("cancelled");
        } else if (turn.run.status === "failed") {
          setPhase("failed");
        } else if (turn.run.status === "cancelled") {
          setPhase("cancelled");
        } else {
          setPhase("done");
        }
        if (turn.summary) setSummary(turn.summary);
        setActiveRun(turn.run);
      } catch (err) {
        // 네트워크/서버 오류 — 실패로 종료.
        setPhase("failed");
        setSummary(
          err instanceof Error
            ? err.message
            : t("errors.runFailed"),
        );
      } finally {
        loopRunningRef.current = false;
      }
    },
    [runActionBatch, readPageState],
  );

  const startRun = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      if (loopRunningRef.current) return;

      cancelRequestedRef.current = false;
      setSummary(null);
      setPhase("running");

      try {
        const first = await startAgentRun({
          prompt: trimmed,
          pageState: readPageState(),
        });
        runIdRef.current = first.run.id;
        setActiveRun(first.run);

        if (first.done) {
          setPhase(
            first.run.status === "failed"
              ? "failed"
              : first.run.status === "cancelled"
                ? "cancelled"
                : "done",
          );
          if (first.summary) setSummary(first.summary);
          return;
        }

        await drive(first);
      } catch (err) {
        setPhase("failed");
        setSummary(
          err instanceof Error
            ? err.message
            : t("errors.startFailed"),
        );
      }
    },
    [drive, readPageState],
  );

  const cancelRun = useCallback(() => {
    cancelRequestedRef.current = true;
    const runId = runIdRef.current;
    if (!runId) {
      setPhase("cancelled");
      return;
    }
    // 협조적 취소 — 서버 플래그를 세운다. 루프는 다음 체크포인트에서 멈춘다.
    void cancelAgentRun(runId).catch(() => {
      // 취소 요청 실패는 치명적이지 않다 — 루프는 로컬 플래그로도 멈춘다.
    });
  }, []);

  const reset = useCallback(() => {
    if (loopRunningRef.current) return;
    runIdRef.current = null;
    cancelRequestedRef.current = false;
    setActiveRun(null);
    setSummary(null);
    setPhase("idle");
  }, []);

  const api = useMemo<AgentRunControllerApi>(
    () => ({
      activeRun,
      phase,
      summary,
      startRun,
      cancelRun,
      reset,
      registerExecutor,
    }),
    [activeRun, phase, summary, startRun, cancelRun, reset, registerExecutor],
  );

  return (
    <AgentRunControllerContext.Provider value={api}>
      {children}
    </AgentRunControllerContext.Provider>
  );
}

/**
 * 에이전트 클라이언트 루프 컨트롤러 훅.
 * 반드시 <AgentRunControllerProvider> 하위에서 호출해야 한다.
 */
export function useAgentRunController(): AgentRunControllerApi {
  const ctx = useContext(AgentRunControllerContext);
  if (!ctx) {
    throw new Error(
      "useAgentRunController() 는 <AgentRunControllerProvider> 하위에서만 사용할 수 있습니다.",
    );
  }
  return ctx;
}
