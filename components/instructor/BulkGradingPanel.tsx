"use client";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { computeMissingBulkGradeStudents } from "@/lib/bulk-grade-roster";
import {
  isNearBottom,
  orderThreadItems,
  resolveSendMode,
} from "@/lib/bulk-grade-thread";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  ExternalLink,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { extractErrorMessage } from "@/lib/error-messages";
import type { ProposedGradesMap } from "@/lib/bulk-grading";
import {
  dashboardStatus,
  dashboardStatusLabel,
  overallScoreLabel,
  type ExamStudentSummary,
} from "@/lib/types/student-summary";

type PermissionKey = "review_before_commit" | "no_precheck" | "ai_default";

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  review_before_commit: "채점 전 승인",
  no_precheck: "채점 승인",
  ai_default: "AI한테 다 맡기기",
};

const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  review_before_commit: "입력한 기준으로 가채점 후 검토하고 확정합니다",
  no_precheck: "사전 확인 없이 바로 가채점을 진행합니다",
  ai_default: "기준 없이 AI 기본 기준으로 가채점합니다",
};

const EXAMPLE_CRITERIA = [
  "논리적 근거 40%, 답변 완성도 30%, 핵심 개념 활용 30%. 부분 점수 허용.",
  "핵심 개념을 정확히 사용했는지 위주로 보고, 사소한 표현 실수는 감점하지 않음.",
  "문제 요구사항 충족 여부를 가장 중요하게 평가.",
];

type BulkGradeProgress = {
  total: number;
  completed: number;
  failed: number;
};

type BulkGradeSession = {
  id: string;
  proposed_grades: ProposedGradesMap;
  /** Submitted sessions the worker already attempted (success OR failure). */
  processed_session_ids?: Record<string, boolean>;
  status: string;
  committed_at: string | null;
  updated_at: string;
  grading_scope?: string;
  /** Instructor's submitted criteria, approval-hint paragraph stripped. */
  criteriaSummary?: string | null;
  progress?: BulkGradeProgress;
};

type BulkGradeStudentIdentity = {
  sessionId: string;
  studentId: string;
  name: string;
  studentNumber?: string;
  school?: string;
  email?: string;
  submittedAt?: string | null;
};

type SessionData = {
  session: BulkGradeSession | null;
  students: BulkGradeStudentIdentity[];
  studentCount: number;
  warning: string | null;
};

type BulkGradeChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type BulkGradeChatData = {
  session: {
    id: string;
    status: string;
    calibration_status: string;
  } | null;
  messages: BulkGradeChatMessage[];
  canStartGrading: boolean;
};

type GradeRow = {
  sessionId: string;
  studentName: string;
  studentMeta: string;
  qIdx: number;
  score: number;
  comment: string;
};

type FinalResultRow = {
  sessionId: string;
  studentName: string;
  studentMeta: string;
  scoreLabel: string;
  statusLabel: string;
};

/** A single renderable item in the single-scroll conversation thread. */
type ThreadItem = {
  key: string;
  ts: number;
  /** tie-break ordering for items sharing a timestamp. */
  seq: number;
  render: () => React.ReactNode;
};

export interface BulkGradingPanelProps {
  examId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted?: () => void;
}

export function BulkGradingPanel({
  examId,
  open,
  onOpenChange,
  onCommitted,
}: BulkGradingPanelProps) {
  const queryClient = useQueryClient();
  const [criteriaMode, setCriteriaMode] = useState<"custom" | "ai_default">("custom");
  const [approvalMode, setApprovalMode] = useState<"review_before_commit" | "no_precheck">(
    "review_before_commit",
  );
  const [editedGrades, setEditedGrades] = useState<ProposedGradesMap | null>(null);
  /** Unified composer text — replaces the old criteriaText + chatDraft. */
  const [draft, setDraft] = useState("");
  /** Optimistic criteria echo right after a start (survives until GET refresh). */
  const [lastSubmittedCriteria, setLastSubmittedCriteria] = useState<{
    text: string;
    ts: number;
  } | null>(null);
  /** When armed, the next Send re-runs grading with new criteria. */
  const [regradeArmed, setRegradeArmed] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const { data, isLoading } = useQuery<SessionData>({
    queryKey: qk.instructor.bulkGradeSession(examId),
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade`, { signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "채점 세션을 불러오지 못했습니다");
      }
      return res.json() as Promise<SessionData>;
    },
    enabled: open && !!examId,
    staleTime: 0,
    refetchInterval: (query) => {
      return query.state.data?.session?.status === "grading" ? 3000 : false;
    },
  });

  const { data: chatData, isLoading: chatLoading } = useQuery<BulkGradeChatData>({
    queryKey: qk.instructor.bulkGradeChat(examId),
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade/chat`, { signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "가채점 대화를 불러오지 못했습니다");
      }
      return res.json() as Promise<BulkGradeChatData>;
    },
    enabled: open && !!examId,
    staleTime: 0,
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, "대화 전송에 실패했습니다", res.status));
      }
      return res.json() as Promise<BulkGradeChatData>;
    },
    onSuccess: (result) => {
      setDraft("");
      queryClient.setQueryData(qk.instructor.bulkGradeChat(examId), result);
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeSession(examId) });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const sessionStatus = data?.session?.status ?? null;
  const isGrading = sessionStatus === "grading";
  const gradingDone = sessionStatus === "grading_done";
  const gradingFailed = sessionStatus === "grading_failed";
  const committed = sessionStatus === "committed";

  const { data: finalSummaries = [], isLoading: finalSummariesLoading } = useQuery<
    ExamStudentSummary[]
  >({
    queryKey: qk.instructor.studentSummaries(examId),
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/exam/${examId}/student-summaries`, { signal });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "확정 결과를 불러오지 못했습니다");
      }
      return (payload.students ?? []) as ExamStudentSummary[];
    },
    enabled: open && committed && !!examId,
    staleTime: 0,
  });

  const progress = data?.session?.progress;
  const hasProgress = !!progress && progress.total > 0;
  const processedCount = progress
    ? Math.min(progress.total, progress.completed + progress.failed)
    : 0;
  const progressPercent = hasProgress
    ? Math.round((processedCount / Math.max(progress.total, 1)) * 100)
    : 0;
  const hasPartialFailure = gradingDone && (progress?.failed ?? 0) > 0;
  const serverGrades = data?.session?.proposed_grades;
  const currentGrades = editedGrades ?? serverGrades ?? null;
  const reviewGrades = committed ? null : currentGrades;
  const studentsBySessionId = useMemo(() => {
    return new Map(
      (data?.students ?? []).map((student, index) => [
        student.sessionId,
        { student, index },
      ]),
    );
  }, [data?.students]);
  const finalSummariesBySessionId = useMemo(() => {
    return new Map(finalSummaries.map((student) => [student.sessionId, student]));
  }, [finalSummaries]);
  const finalRows = useMemo<FinalResultRow[]>(() => {
    const rows = (data?.students ?? []).map((identity) => {
      const summary = finalSummariesBySessionId.get(identity.sessionId);
      const studentMeta = [
        identity.studentNumber ?? summary?.studentNumber,
        identity.email ?? summary?.email,
      ]
        .filter(Boolean)
        .join(" · ");

      return {
        sessionId: identity.sessionId,
        studentName: identity.name ?? summary?.name ?? `Student ${identity.sessionId.slice(0, 8)}`,
        studentMeta,
        scoreLabel: overallScoreLabel({ overallScore: summary?.overallScore }),
        statusLabel: summary
          ? dashboardStatusLabel(dashboardStatus(summary))
          : "확정됨",
      };
    });

    for (const summary of finalSummaries) {
      if (rows.some((row) => row.sessionId === summary.sessionId)) continue;
      const studentMeta = [summary.studentNumber, summary.email]
        .filter(Boolean)
        .join(" · ");
      rows.push({
        sessionId: summary.sessionId,
        studentName: summary.name,
        studentMeta,
        scoreLabel: overallScoreLabel({ overallScore: summary.overallScore }),
        statusLabel: dashboardStatusLabel(dashboardStatus(summary)),
      });
    }

    return rows;
  }, [data?.students, finalSummaries, finalSummariesBySessionId]);

  const startGradingMutation = useMutation({
    mutationFn: async () => {
      const criteria = criteriaMode === "ai_default" ? "" : draft.trim();
      const res = await fetch(`/api/exam/${examId}/bulk-grade/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "full",
          criteriaText: criteria,
          criteriaMode,
          approvalMode,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, "채점 시작에 실패했습니다.", res.status));
      }
      return res.json() as Promise<{ ok: boolean; total: number }>;
    },
    onSuccess: (result) => {
      toast.success(`${result.total}명 전체 CASE 가채점을 시작했습니다.`);
      setEditedGrades(null);
      setRegradeArmed(false);
      setDraft("");
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeSession(examId) });
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeChat(examId) });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!currentGrades || Object.keys(currentGrades).length === 0) {
        throw new Error("확정할 채점 결과가 없습니다.");
      }
      const grades = Object.entries(currentGrades).flatMap(([sessionId, qMap]) =>
        Object.entries(qMap).map(([qIdxStr, { score, comment }]) => ({
          session_id: sessionId,
          q_idx: Number(qIdxStr),
          score,
          comment,
        })),
      );
      const res = await fetch(`/api/exam/${examId}/bulk-grade/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grades }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, "채점 저장에 실패했습니다", res.status));
      }
      return res.json() as Promise<{ ok: boolean; gradedCount: number }>;
    },
    onSuccess: (result) => {
      toast.success(`${result.gradedCount}개 채점이 확정되었습니다. 성적 공개는 별도로 진행하세요.`);
      setEditedGrades(null);
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeSession(examId) });
      queryClient.invalidateQueries({ queryKey: qk.instructor.studentSummaries(examId) });
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeChat(examId) });
      onCommitted?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const gradeRows = useMemo<GradeRow[]>(() => {
    if (!reviewGrades) return [];
    const rows: GradeRow[] = [];
    for (const [sessionId, qMap] of Object.entries(reviewGrades)) {
      const studentEntry = studentsBySessionId.get(sessionId);
      const student = studentEntry?.student;
      const studentMeta = [student?.studentNumber, student?.email]
        .filter(Boolean)
        .join(" · ");
      for (const [qIdxStr, { score, comment }] of Object.entries(qMap)) {
        rows.push({
          sessionId,
          studentName: student?.name ?? `Student ${sessionId.slice(0, 8)}`,
          studentMeta,
          qIdx: Number(qIdxStr),
          score,
          comment,
        });
      }
    }
    rows.sort((a, b) => {
      const orderA = studentsBySessionId.get(a.sessionId)?.index ?? Number.MAX_SAFE_INTEGER;
      const orderB = studentsBySessionId.get(b.sessionId)?.index ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB || a.sessionId.localeCompare(b.sessionId) || a.qIdx - b.qIdx;
    });
    return rows;
  }, [reviewGrades, studentsBySessionId]);

  const totalGrades = gradeRows.length;

  // Students that were part of this grading attempt but have NO proposed grade.
  // Previously these were silently dropped (the table only iterated proposed_grades),
  // so a worker failure made a student vanish. Surface them explicitly:
  //  - failed:  worker already processed them but produced no grade (AI error/parse) → "채점 실패"
  //  - pending: not yet processed (still running) → "대기 중"
  const gradingAttempted = isGrading || gradingDone || gradingFailed;
  const missingStudents = useMemo(
    () =>
      computeMissingBulkGradeStudents({
        students: data?.students ?? [],
        reviewGrades: reviewGrades ?? null,
        processedSessionIds: data?.session?.processed_session_ids ?? {},
        committed,
        gradingAttempted,
      }),
    [
      committed,
      gradingAttempted,
      reviewGrades,
      data?.students,
      data?.session?.processed_session_ids,
    ],
  );
  const failedCount = missingStudents.filter((s) => s.failed).length;

  const handleCommit = () => {
    if (
      progress?.failed &&
      progress.failed > 0 &&
      !window.confirm(`${progress.failed}명 채점에 실패했습니다. 성공한 제안 점수만 확정하시겠습니까?`)
    ) {
      return;
    }
    commitMutation.mutate();
  };

  const permissionKey: PermissionKey =
    criteriaMode === "ai_default" ? "ai_default" : approvalMode;

  const handlePermissionSelect = (value: string) => {
    if (value === "ai_default") {
      setCriteriaMode("ai_default");
      setApprovalMode("review_before_commit");
    } else if (value === "no_precheck") {
      setCriteriaMode("custom");
      setApprovalMode("no_precheck");
    } else {
      setCriteriaMode("custom");
      setApprovalMode("review_before_commit");
    }
  };

  const focusComposer = () => {
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const armRegrade = () => {
    setRegradeArmed(true);
    const lastCriteria =
      data?.session?.criteriaSummary ?? lastSubmittedCriteria?.text ?? "";
    setDraft(lastCriteria);
    if (criteriaMode === "ai_default") setCriteriaMode("custom");
    focusComposer();
  };

  const cancelRegrade = () => {
    setRegradeArmed(false);
    setDraft("");
  };

  // ─── Send routing ──────────────────────────────────────────────────────────
  const sendMode = resolveSendMode({
    committed,
    isGrading,
    gradingDone,
    gradingFailed,
    regradeArmed,
  });
  const startPending = startGradingMutation.isPending;
  const chatPending = chatMutation.isPending;
  const trimmedDraft = draft.trim();

  const sendDisabled =
    (sendMode === "start" && !trimmedDraft && criteriaMode !== "ai_default") ||
    (sendMode === "discuss" && !trimmedDraft) ||
    (sendMode === "start" ? startPending || isGrading : chatPending);
  const sendBusy = sendMode === "start" ? startPending || isGrading : chatPending;

  const send = () => {
    if (sendDisabled) return;
    if (sendMode === "start") {
      setLastSubmittedCriteria({
        text: criteriaMode === "ai_default" ? "" : trimmedDraft,
        ts: Date.now(),
      });
      startGradingMutation.mutate();
    } else {
      const message = trimmedDraft;
      if (!message) return;
      chatMutation.mutate(message);
    }
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
    }
  };

  // ─── Escape to close ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // ─── Thread items (single ordered timeline) ──────────────────────────────────
  const gradingStartTs = useMemo(() => {
    const sessionTs = data?.session?.updated_at
      ? Date.parse(data.session.updated_at)
      : NaN;
    if (Number.isFinite(sessionTs)) return sessionTs;
    if (lastSubmittedCriteria) return lastSubmittedCriteria.ts;
    return Date.now();
  }, [data?.session?.updated_at, lastSubmittedCriteria]);

  const resultCardTs = useMemo(() => {
    const sessionTs = data?.session?.updated_at
      ? Date.parse(data.session.updated_at)
      : NaN;
    return Number.isFinite(sessionTs) ? sessionTs : gradingStartTs;
  }, [data?.session?.updated_at, gradingStartTs]);

  const criteriaEchoText =
    data?.session?.criteriaSummary ||
    lastSubmittedCriteria?.text ||
    "가채점을 시작했습니다";

  const threadItems = useMemo<ThreadItem[]>(() => {
    const items: ThreadItem[] = [];

    // Persisted chat messages.
    for (const message of chatData?.messages ?? []) {
      const ts = Date.parse(message.created_at);
      items.push({
        key: `msg-${message.id}`,
        ts: Number.isFinite(ts) ? ts : 0,
        seq: 5,
        render: () =>
          message.role === "user" ? (
            <div
              key={`msg-${message.id}`}
              className="ml-auto max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm"
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ) : (
            <div
              key={`msg-${message.id}`}
              className="text-sm leading-relaxed text-foreground"
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ),
      });
    }

    // Criteria echo bubble (only once a run exists / started).
    if (gradingAttempted || committed) {
      items.push({
        key: "criteria-echo",
        ts: gradingStartTs,
        seq: 0,
        render: () => (
          <div
            key="criteria-echo"
            className="ml-auto max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm"
            data-testid="bulk-grade-criteria-echo"
          >
            <p className="whitespace-pre-wrap">{criteriaEchoText}</p>
          </div>
        ),
      });
    }

    // Live progress / failure micro-rows.
    if (isGrading) {
      items.push({
        key: "status-grading",
        ts: gradingStartTs,
        seq: 1,
        render: () => (
          <p
            key="status-grading"
            className="text-xs text-muted-foreground"
            aria-live="polite"
          >
            전체 CASE 가채점 중 · 처리 {processedCount}/{progress?.total ?? 0}
            {progress && progress.failed > 0 ? ` · 실패 ${progress.failed}명` : ""}
          </p>
        ),
      });
    }

    if (gradingFailed || hasPartialFailure) {
      items.push({
        key: "status-failure",
        ts: gradingStartTs,
        seq: 2,
        render: () => (
          <p
            key="status-failure"
            className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {gradingFailed
                ? "일부 CASE 가채점이 완료되지 않았습니다. 다시 채점하면 이전 제안 점수를 초기화하고 새로 생성합니다."
                : `${progress?.failed ?? 0}명 가채점에 실패했습니다. 성공한 제안 점수만 확정할 수 있습니다.`}
            </span>
          </p>
        ),
      });
    }

    // Result card (only after a run starts).
    if (gradingAttempted || committed) {
      items.push({
        key: "result-card",
        ts: resultCardTs,
        seq: 3,
        render: () => <div key="result-card">{renderResultCard()}</div>,
      });
    }

    return orderThreadItems(items);
    // renderResultCard intentionally recreated each render; deps below cover its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chatData?.messages,
    gradingAttempted,
    committed,
    isGrading,
    gradingFailed,
    hasPartialFailure,
    gradingStartTs,
    resultCardTs,
    criteriaEchoText,
    processedCount,
    progress,
    // result card inputs:
    gradeRows,
    missingStudents,
    finalRows,
    finalSummariesLoading,
    currentGrades,
    editedGrades,
    commitMutation.isPending,
    startGradingMutation.isPending,
  ]);

  const chatMessageCount = chatData?.messages?.length ?? 0;
  const hasThreadContent =
    chatMessageCount > 0 || gradingAttempted || committed;

  // ─── Stick-to-bottom ─────────────────────────────────────────────────────────
  const handleThreadScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    const near = isNearBottom({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
    wasNearBottomRef.current = near;
    setShowJumpToBottom(!near);
  };

  const scrollToBottom = () => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    wasNearBottomRef.current = true;
    setShowJumpToBottom(false);
  };

  // After items change, stick to bottom if the user was near it.
  useLayoutEffect(() => {
    if (!open) return;
    if (wasNearBottomRef.current) {
      const el = threadRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      setShowJumpToBottom(false);
    } else {
      setShowJumpToBottom(true);
    }
  }, [threadItems, open]);

  // Scroll to bottom on open.
  useEffect(() => {
    if (!open) return;
    wasNearBottomRef.current = true;
    requestAnimationFrame(() => {
      const el = threadRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [open]);

  const startDisabledForCard = isGrading || committed || startGradingMutation.isPending;
  const canRegradeArm =
    (gradingDone || gradingFailed) && !committed && !isGrading;
  const showCommit =
    gradingDone && !!currentGrades && Object.keys(currentGrades).length > 0 && !committed;

  // ─── Result card ─────────────────────────────────────────────────────────────
  function renderResultCard(): React.ReactNode {
    const statusBadge = committed ? (
      <Badge variant="secondary">반영됨</Badge>
    ) : isGrading ? (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        채점 중
      </Badge>
    ) : (
      <Badge variant="outline">가채점 완료</Badge>
    );

    const title = committed ? "확정된 CASE 채점" : "AI 제안 점수";
    const count = committed ? finalRows.length : totalGrades;

    return (
      <Collapsible defaultOpen className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">({count}개)</span>
          {statusBadge}
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
        </CollapsibleTrigger>

        {isGrading && hasProgress && (
          <div className="px-4 pb-3">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>
                처리 {processedCount}/{progress.total}명
                {progress.failed > 0
                  ? ` · 성공 ${progress.completed}명 · 실패 ${progress.failed}명`
                  : ""}
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 py-3">
            {/* (a) Missing students first — no-silent-drop behavior preserved. */}
            {missingStudents.length > 0 && (
              <div
                className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
                data-testid="bulk-grade-missing-students"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      {isGrading
                        ? `처리 대기 중 ${missingStudents.length}명`
                        : `채점되지 않은 학생 ${missingStudents.length}명${
                            failedCount > 0 ? ` (실패 ${failedCount}명)` : ""
                          }`}
                    </span>
                  </div>
                  {!isGrading && !committed && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startGradingMutation.mutate()}
                      disabled={startDisabledForCard}
                      className="h-7 shrink-0 px-2 text-xs"
                    >
                      {startGradingMutation.isPending && (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      )}
                      다시 가채점
                    </Button>
                  )}
                </div>
                <ul className="space-y-1" data-testid="bulk-grade-missing-list">
                  {missingStudents.map((s) => (
                    <li
                      key={s.sessionId}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-medium text-foreground">{s.studentName}</span>
                        {s.studentMeta && (
                          <span className="ml-1 text-muted-foreground">· {s.studentMeta}</span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[11px]",
                          s.failed
                            ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {s.failed ? "채점 실패" : "대기 중"}
                      </span>
                    </li>
                  ))}
                </ul>
                {!isGrading && !committed && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    채점되지 않은 학생은 “다시 가채점”으로 새로 시도합니다. (이전 제안 점수는 초기화됩니다)
                  </p>
                )}
              </div>
            )}

            {/* (b) editable grade table OR (c) committed final summary. */}
            {committed ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  확정 총점은 학생 목록과 같은 final grade 기준으로 표시됩니다.
                </p>
                {finalSummariesLoading ? (
                  <div className="flex items-center justify-center rounded-md border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    확정 결과 불러오는 중...
                  </div>
                ) : finalRows.length === 0 ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                    확정 결과가 없습니다. 학생 목록에서 최종 점수를 확인하세요.
                  </div>
                ) : (
                  <table className="w-full text-xs" data-testid="bulk-grade-final-results">
                    <thead className="bg-background">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-1 pr-2 font-normal">학생</th>
                        <th className="pb-1 pr-2 font-normal">총점</th>
                        <th className="pb-1 font-normal">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finalRows.map((row) => (
                        <tr key={row.sessionId} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">
                            <div className="font-medium text-foreground">{row.studentName}</div>
                            {row.studentMeta && (
                              <div
                                className="max-w-[180px] truncate text-[11px] text-muted-foreground"
                                title={row.studentMeta}
                              >
                                {row.studentMeta}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 font-medium tabular-nums">
                            {row.scoreLabel}
                          </td>
                          <td className="py-1.5 text-muted-foreground">{row.statusLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : gradeRows.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-background">
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-1 pr-2 font-normal">학생</th>
                    <th className="pb-1 pr-2 font-normal">문제</th>
                    <th className="pb-1 pr-2 font-normal">점수</th>
                    <th className="pb-1 pr-2 font-normal">코멘트</th>
                    <th className="pb-1 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {gradeRows.map((row) => (
                    <tr key={`${row.sessionId}-${row.qIdx}`} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">
                        <div className="font-medium text-foreground">{row.studentName}</div>
                        {row.studentMeta && (
                          <div
                            className="max-w-[140px] truncate text-[11px] text-muted-foreground"
                            title={row.studentMeta}
                          >
                            {row.studentMeta}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-muted-foreground">Q{row.qIdx + 1}</td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={row.score}
                          onChange={(e) => {
                            const v = Math.min(100, Math.max(0, Number(e.target.value)));
                            setEditedGrades((prev) => {
                              const base = prev ?? currentGrades;
                              if (!base) return prev;
                              return {
                                ...base,
                                [row.sessionId]: {
                                  ...base[row.sessionId],
                                  [row.qIdx]: {
                                    ...base[row.sessionId]?.[row.qIdx],
                                    score: v,
                                  },
                                },
                              };
                            });
                          }}
                          className="w-14 rounded border px-1 py-0.5 text-right"
                        />
                      </td>
                      <td
                        className="max-w-[220px] truncate py-1.5 pr-2 text-muted-foreground"
                        title={row.comment}
                      >
                        {row.comment}
                      </td>
                      <td className="py-1.5">
                        <a
                          href={`/instructor/${examId}/grade/${row.sessionId}?questionType=case&qIdx=${row.qIdx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${row.studentName} Q${row.qIdx + 1} 개별 채점 새 탭에서 열기`}
                          data-testid={`bulk-grade-row-link-${row.sessionId}-${row.qIdx}`}
                          className="inline-flex items-center gap-0.5 whitespace-nowrap text-blue-600 hover:underline"
                        >
                          개별 채점
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              !isGrading && (
                <p className="text-sm text-muted-foreground">
                  제안 점수가 아직 없습니다.
                </p>
              )
            )}

            {/* Footer: commit + re-grade arm. */}
            {(showCommit || canRegradeArm) && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                {showCommit && (
                  <Button
                    type="button"
                    onClick={handleCommit}
                    disabled={commitMutation.isPending}
                  >
                    {commitMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      `채점 확정 (${totalGrades}개)`
                    )}
                  </Button>
                )}
                {canRegradeArm && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={armRegrade}
                    disabled={regradeArmed}
                  >
                    다시 채점
                  </Button>
                )}
              </div>
            )}
            {committed && (
              <div className="border-t pt-3 text-xs text-muted-foreground">
                확정된 채점입니다. 총점은 학생 목록에서 확인하고, 아래 입력란에서 결과를 계속 논의할 수 있습니다.
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <aside
      role="complementary"
      aria-label="CASE AI 가채점"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex h-full w-[480px] max-w-full flex-col overflow-hidden border-l bg-background shadow-lg",
        "transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">CASE AI 가채점</h2>
        {data?.studentCount != null && (
          <span className="text-xs font-normal text-muted-foreground">
            (대상 {data.studentCount}명)
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="닫기"
          className="ml-auto rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Thread — the only scroll area */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={threadRef}
          onScroll={handleThreadScroll}
          className="h-full overflow-y-auto px-5 py-4"
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          ) : !hasThreadContent ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                채점 기준을 입력하면 채점을 시작합니다
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLE_CRITERIA.map((example) => (
                  <Button
                    key={example}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto max-w-[260px] whitespace-normal py-1.5 text-left text-xs"
                    onClick={() => {
                      setCriteriaMode("custom");
                      setDraft(example);
                      focusComposer();
                    }}
                  >
                    {example}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3" data-testid="bulk-grade-thread">
              {chatLoading && chatMessageCount === 0 && (
                <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  대화 불러오는 중...
                </div>
              )}
              {threadItems.map((item) => (
                <div key={item.key}>{item.render()}</div>
              ))}
              {data?.warning && (
                <p className="text-xs text-amber-600">{data.warning}</p>
              )}
            </div>
          )}
        </div>

        {showJumpToBottom && (
          <button
            type="button"
            aria-label="맨 아래로 이동"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs shadow-md hover:bg-muted"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            맨 아래로
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t px-5 py-3">
        {regradeArmed && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <span className="flex-1">
              새 기준으로 다시 채점 — 전송 시 이전 제안 점수 초기화
            </span>
            <button
              type="button"
              onClick={cancelRegrade}
              className="font-medium underline-offset-2 hover:underline"
            >
              취소
            </button>
          </div>
        )}

        <div className="rounded-xl border bg-background px-3 pb-2 pt-2.5 shadow-sm focus-within:ring-1 focus-within:ring-ring">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value.trim() && criteriaMode === "ai_default") {
                setCriteriaMode("custom");
              }
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder={
              sendMode === "start"
                ? "채점 기준을 입력하고 Enter로 채점을 시작하세요. (Shift+Enter 줄바꿈)"
                : "가채점 기준, 결과 해석, 검토 관점을 질문하세요. (Enter 전송 · Shift+Enter 줄바꿈)"
            }
            data-testid="bulk-grade-composer-input"
            className="max-h-48 min-h-[44px] resize-none border-0 p-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          />

          <div className="flex items-center justify-between gap-2 pt-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isGrading || startPending}
                  className="h-8 gap-1 px-2 text-muted-foreground"
                  data-testid="bulk-grade-mode-picker"
                >
                  {PERMISSION_LABELS[permissionKey]}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuRadioGroup
                  value={permissionKey}
                  onValueChange={handlePermissionSelect}
                >
                  {(Object.keys(PERMISSION_LABELS) as PermissionKey[]).map((key) => (
                    <DropdownMenuRadioItem key={key} value={key} className="items-start">
                      <div className="flex flex-col">
                        <span className="text-sm">{PERMISSION_LABELS[key]}</span>
                        <span className="text-xs text-muted-foreground">
                          {PERMISSION_DESCRIPTIONS[key]}
                        </span>
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              size="icon"
              aria-label={sendMode === "start" ? "전체 CASE 가채점 시작" : "가채점 대화 전송"}
              onClick={send}
              disabled={sendDisabled}
              data-testid="bulk-grade-send"
              className="h-8 w-8 rounded-lg"
            >
              {sendBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
