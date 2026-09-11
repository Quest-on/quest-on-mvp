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
import { useTranslations } from "next-intl";
import { computeMissingBulkGradeStudents } from "@/lib/bulk-grade-roster";
import {
  isNearBottom,
  orderThreadItems,
  resolveSendMode,
  formatPickedQACriteria,
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
import { createClientMessageId } from "@/lib/client-message-id";
import type { ProposedGradesMap } from "@/lib/bulk-grading";
import {
  dashboardStatus,
  dashboardStatusLabel,
  overallScoreLabel,
  type ExamStudentSummary,
} from "@/lib/types/student-summary";

type PermissionKey = "review_before_commit" | "no_precheck" | "ai_default";

const EXAMPLE_CRITERIA = [
  "논리 40, 완성도 30, 개념 30",
  "핵심 개념 중심, 표현 실수는 관대하게",
  "요구사항 충족을 최우선",
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
  canProceedToGrading?: boolean;
  interviewQuestionCount?: number;
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
  mode?: "exam" | "assignment";
}

export function BulkGradingPanel({
  examId,
  open,
  onOpenChange,
  onCommitted,
  mode = "exam",
}: BulkGradingPanelProps) {
  const queryClient = useQueryClient();
  const t = useTranslations("grading");

  const PERMISSION_LABELS: Record<PermissionKey, string> = {
    review_before_commit: t("bulkGrading.permissionReviewLabel"),
    no_precheck: t("bulkGrading.permissionNoPrecheckLabel"),
    ai_default: t("bulkGrading.permissionAiDefaultLabel"),
  };

  const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
    review_before_commit: t("bulkGrading.permissionReviewDesc"),
    no_precheck: t("bulkGrading.permissionNoPrecheckDesc"),
    ai_default: t("bulkGrading.permissionAiDefaultDesc"),
  };

  /** Visible noun for the grading target: "과제" for assignments, "CASE" for exams. */
  const gradeNoun = mode === "assignment" ? t("bulkGrading.gradeNounAssignment") : t("bulkGrading.gradeNounExam");
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

  /** Quick-reply chips offered by the AI during the interviewing phase. */
  const [chatOptions, setChatOptions] = useState<string[]>([]);
  /** Q&A pairs accumulated via quick-reply chip selection. */
  const [pickedQA, setPickedQA] = useState<{ q: string; a: string }[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);
  const sendInFlightRef = useRef(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  /** Guards against re-fetching options for the same assistant message. */
  const lastFetchedMsgIdRef = useRef<string | null>(null);

  const releaseSendLock = () => {
    sendInFlightRef.current = false;
  };

  const { data, isLoading } = useQuery<SessionData>({
    queryKey: qk.instructor.bulkGradeSession(examId),
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade`, { signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || t("bulkGrading.sessionLoadFail"));
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
        throw new Error(err.message || t("bulkGrading.chatLoadFail"));
      }
      return res.json() as Promise<BulkGradeChatData>;
    },
    enabled: open && !!examId,
    staleTime: 0,
  });

  /** Fetches quick-reply options for the latest AI question (silent degradation). */
  const chatOptionsMutation = useMutation({
    mutationFn: async ({
      questionText,
      gradingSessionId,
    }: {
      questionText: string;
      gradingSessionId: string;
    }) => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade/chat-options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionText, gradingSessionId }),
      });
      if (!res.ok) return { success: false, options: [] as string[] };
      return res.json() as Promise<{ success: boolean; options: string[] }>;
    },
    onSuccess: (result) => {
      setChatOptions(result.options ?? []);
    },
    onError: () => {
      setChatOptions([]);
    },
  });

  const initChatMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, t("bulkGrading.interviewStartFail"), res.status));
      }
      return res.json() as Promise<BulkGradeChatData>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(qk.instructor.bulkGradeChat(examId), result);
      const msgs = result.messages ?? [];
      const lastMsg = msgs[msgs.length - 1];
      const sessionId = result.session?.id;
      if (lastMsg?.role === "assistant" && sessionId) {
        setChatOptions([]);
        lastFetchedMsgIdRef.current = lastMsg.id;
        chatOptionsMutation.mutate({
          questionText: lastMsg.content,
          gradingSessionId: sessionId,
        });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const chatMutation = useMutation({
    mutationFn: async ({
      message,
      clientMessageId,
    }: {
      message: string;
      clientMessageId: string;
    }) => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, clientMessageId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, t("bulkGrading.sendFail"), res.status));
      }
      return res.json() as Promise<BulkGradeChatData>;
    },
    onSuccess: (result) => {
      setDraft("");
      queryClient.setQueryData(qk.instructor.bulkGradeChat(examId), result);
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeSession(examId) });

      // 마지막 메시지가 AI(assistant)면 phase 무관하게 보기를 생성한다.
      // lastFetchedMsgIdRef 동치 가드로 init useEffect와의 이중 fetch를 막는다.
      const msgs = result.messages ?? [];
      const lastMsg = msgs[msgs.length - 1];
      const sessionId = result.session?.id ?? chatData?.session?.id;
      if (
        lastMsg?.role === "assistant" &&
        sessionId &&
        lastMsg.id !== lastFetchedMsgIdRef.current
      ) {
        setChatOptions([]); // clear while fetching
        lastFetchedMsgIdRef.current = lastMsg.id;
        chatOptionsMutation.mutate({
          questionText: lastMsg.content,
          gradingSessionId: sessionId,
        });
      } else if (lastMsg?.role !== "assistant") {
        setChatOptions([]);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSettled: releaseSendLock,
  });

  const completeInterviewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completeInterview: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          extractErrorMessage(err, t("bulkGrading.interviewEndFail"), res.status),
        );
      }
      return res.json() as Promise<BulkGradeChatData>;
    },
    onSuccess: (result) => {
      setChatOptions([]);
      queryClient.setQueryData(qk.instructor.bulkGradeChat(examId), result);
      toast.success(t("bulkGrading.proceedReady"));
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
        throw new Error(payload.message || t("bulkGrading.finalLoadFail"));
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
        .join(", ");

      return {
        sessionId: identity.sessionId,
        studentName: identity.name ?? summary?.name ?? `Student ${identity.sessionId.slice(0, 8)}`,
        studentMeta,
        scoreLabel: overallScoreLabel({ overallScore: summary?.overallScore }),
        statusLabel: summary
          ? dashboardStatusLabel(dashboardStatus(summary))
          : t("bulkGrading.statusCommitted"),
      };
    });

    for (const summary of finalSummaries) {
      if (rows.some((row) => row.sessionId === summary.sessionId)) continue;
      const studentMeta = [summary.studentNumber, summary.email]
        .filter(Boolean)
        .join(", ");
      rows.push({
        sessionId: summary.sessionId,
        studentName: summary.name,
        studentMeta,
        scoreLabel: overallScoreLabel({ overallScore: summary.overallScore }),
        statusLabel: dashboardStatusLabel(dashboardStatus(summary)),
      });
    }

    return rows;
  }, [data?.students, finalSummaries, finalSummariesBySessionId, t]);

  const startGradingMutation = useMutation({
    mutationFn: async () => {
      const base = regradeArmed && criteriaMode !== "ai_default" ? draft.trim() : "";
      const enriched = (base + formatPickedQACriteria(pickedQA)).slice(0, 8000);
      const res = await fetch(`/api/exam/${examId}/bulk-grade/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "full",
          criteriaText: enriched,
          criteriaMode,
          approvalMode,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, t("bulkGrading.startFail"), res.status));
      }
      return res.json() as Promise<{ ok: boolean; total: number }>;
    },
    onSuccess: (result) => {
      toast.success(t("bulkGrading.startSuccess", { total: result.total, gradeNoun }));
      setEditedGrades(null);
      setRegradeArmed(false);
      setDraft("");
      setPickedQA([]);
      setChatOptions([]);
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeSession(examId) });
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeChat(examId) });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSettled: releaseSendLock,
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!currentGrades || Object.keys(currentGrades).length === 0) {
        throw new Error(t("bulkGrading.noGradesToCommit"));
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
        throw new Error(extractErrorMessage(err, t("bulkGrading.saveFail"), res.status));
      }
      return res.json() as Promise<{ ok: boolean; gradedCount: number }>;
    },
    onSuccess: (result) => {
      toast.success(t("bulkGrading.commitSuccess", { gradedCount: result.gradedCount }));
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
        .join(", ");
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
  const interviewReady = chatData?.canStartGrading ?? false;
  const canProceedToGrading = chatData?.canProceedToGrading ?? false;
  const interviewInProgress =
    !gradingAttempted && !committed && (chatData?.messages?.length ?? 0) > 0;
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
      !window.confirm(t("bulkGrading.confirmPartialFail", { failed: progress.failed }))
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

  // ─── Quick-reply chip logic (phase-agnostic) ────────────────────────────────
  // 칩은 "마지막 메시지가 AI(assistant)"이고 "확정 전 · 채점 중 아님"일 때 표시한다.
  // 가채점 전 인터뷰와 가채점 후 토론 모두에서 동일하게 동작한다.
  const lastMessage =
    chatData?.messages?.[(chatData?.messages.length ?? 0) - 1];
  const canShowChips =
    lastMessage?.role === "assistant" && !committed && !isGrading;

  /** Quick-reply pick chips for the latest AI question. Re-grade lives in a button. */
  const displayedOptions: string[] = canShowChips ? chatOptions : [];

  const handleOptionPick = (label: string) => {
    // 답을 선택: Q&A 쌍을 기록하고 채팅 메시지로 전송한다. 이 누적(pickedQA)은
    // 다음 재가채점 시 criteria에 반영된다(대화로 조정 → 재가채점 흐름).
    // startGradingMutation.onSuccess가 매 재가채점마다 setPickedQA([])로 비운다.
    const msgs = chatData?.messages ?? [];
    const latestQ =
      [...msgs].reverse().find((m) => m.role === "assistant")?.content ?? "";
    setPickedQA((prev) => [...prev, { q: latestQ, a: label }]);
    setChatOptions([]);
    chatMutation.mutate({ message: label, clientMessageId: createClientMessageId() });
  };

  // ─── Send routing ──────────────────────────────────────────────────────────
  const sendMode = resolveSendMode({
    committed,
    isGrading,
    gradingDone,
    gradingFailed,
    regradeArmed,
    interviewReady,
  });
  const startPending = startGradingMutation.isPending;
  const chatPending = chatMutation.isPending;
  const trimmedDraft = draft.trim();

  const sendDisabled =
    (sendMode === "start" && !interviewReady && !regradeArmed) ||
    (sendMode === "discuss" && !trimmedDraft) ||
    (sendMode === "start" ? startPending || isGrading : chatPending);
  const sendBusy = sendMode === "start" ? startPending || isGrading : chatPending;

  const send = () => {
    if (sendInFlightRef.current) return;
    if (sendDisabled) return;
    sendInFlightRef.current = true;
    if (sendMode === "start") {
      setLastSubmittedCriteria({
        text: criteriaMode === "ai_default" ? "" : trimmedDraft,
        ts: Date.now(),
      });
      startGradingMutation.mutate();
    } else {
      const message = trimmedDraft;
      if (!message) {
        releaseSendLock();
        return;
      }
      chatMutation.mutate({ message, clientMessageId: createClientMessageId() });
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

  // ─── 보기(quick-reply) fetch — 패널 오픈/대화 갱신 시 ─────────────────────────
  // 마지막 메시지가 AI 질문이고 확정 전·채점 중이 아니면, phase 무관하게 보기를
  // 생성한다(가채점 후 토론 포함). onSuccess와 같은 lastFetchedMsgIdRef 가드 공유.
  useEffect(() => {
    if (!open) return;
    if (committed || isGrading) return; // 칩이 의미 없는 상태는 skip
    const sessionId = chatData?.session?.id;
    if (!sessionId) return;

    const msgs = chatData?.messages ?? [];
    const lastMsg = msgs[msgs.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;
    // Guard: don't re-fetch for the same message.
    if (lastFetchedMsgIdRef.current === lastMsg.id) return;

    lastFetchedMsgIdRef.current = lastMsg.id;
    setChatOptions([]); // clear while fetching
    chatOptionsMutation.mutate({
      questionText: lastMsg.content,
      gradingSessionId: sessionId,
    });
    // chatOptionsMutation is stable; we only re-run when messages change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chatData?.messages, chatData?.session?.id, committed, isGrading]);

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
    t("bulkGrading.criteriaEchoDefault");

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
            className="type-meta"
            aria-live="polite"
          >
            {t("bulkGrading.gradingStatusLabel", { gradeNoun, processed: processedCount, total: progress?.total ?? 0 })}
            {progress && progress.failed > 0 ? ` ${t("bulkGrading.gradingStatusFailed", { failed: progress.failed })}` : ""}
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
            className="flex items-start gap-1.5 text-xs text-warning-text"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {gradingFailed
                ? t("bulkGrading.partialFailMsg")
                : t("bulkGrading.failedCountMsg", { failed: progress?.failed ?? 0 })}
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
    chatMessageCount > 0 || gradingAttempted || committed || initChatMutation.isPending;

  // Auto-start AI-led criteria interview when the panel opens.
  useEffect(() => {
    if (!open || !examId) return;
    if (gradingAttempted || committed) return;
    if (chatLoading || initChatMutation.isPending || chatMutation.isPending) return;
    if ((data?.studentCount ?? 0) === 0) return;
    const hasAssistant = chatData?.messages?.some((m) => m.role === "assistant");
    if (hasAssistant) return;
    initChatMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, examId, chatLoading, chatData?.messages, data?.studentCount, gradingAttempted, committed]);

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
      <Badge variant="secondary">{t("bulkGrading.badgeCommitted")}</Badge>
    ) : isGrading ? (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("bulkGrading.badgeGrading")}
      </Badge>
    ) : (
      <Badge variant="outline">{t("bulkGrading.badgeDone")}</Badge>
    );

    const title = committed ? t("bulkGrading.resultTitleCommitted", { gradeNoun }) : t("bulkGrading.resultTitleProposed");
    const count = committed ? finalRows.length : totalGrades;

    return (
      <Collapsible defaultOpen className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left">
          <span className="type-field-label">{title}</span>
          <span className="type-meta">{t("bulkGrading.resultCount", { count })}</span>
          {statusBadge}
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
        </CollapsibleTrigger>

        {isGrading && hasProgress && (
          <div className="px-4 pb-3">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>
                {t("bulkGrading.progressProcessed", { processed: processedCount, total: progress.total })}
                {progress.failed > 0
                  ? ` ${t("bulkGrading.progressDetail", { completed: progress.completed, failed: progress.failed })}`
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
                className="space-y-2 rounded-md border border-warning-border bg-warning-surface p-3"
                data-testid="bulk-grade-missing-students"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-warning-text">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      {isGrading
                        ? t("bulkGrading.pendingStudents", { count: missingStudents.length })
                        : failedCount > 0
                          ? t("bulkGrading.ungradedWithFailed", { count: missingStudents.length, failed: failedCount })
                          : t("bulkGrading.ungradedStudents", { count: missingStudents.length })}
                    </span>
                  </div>
                  {!isGrading && !committed && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (sendInFlightRef.current || startDisabledForCard) return;
                        sendInFlightRef.current = true;
                        startGradingMutation.mutate();
                      }}
                      disabled={startDisabledForCard}
                      className="h-7 shrink-0 px-2 text-xs"
                    >
                      {startGradingMutation.isPending && (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      )}
                      {t("bulkGrading.regradeButton")}
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
                          <span className="ml-1 text-muted-foreground">{s.studentMeta}</span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[11px]",
                          s.failed
                            ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {s.failed ? t("bulkGrading.badgeFailed") : t("bulkGrading.badgePending")}
                      </span>
                    </li>
                  ))}
                </ul>
                {!isGrading && !committed && (
                  <p className="text-[11px] text-warning-text">
                    {t("bulkGrading.regradeWarning")}
                  </p>
                )}
              </div>
            )}

            {/* (b) editable grade table OR (c) committed final summary. */}
            {committed ? (
              <div className="space-y-3">
                <p className="type-meta">{t("bulkGrading.committedNote")}</p>
                {finalSummariesLoading ? (
                  <div className="flex items-center justify-center rounded-md border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("bulkGrading.finalLoadingMsg")}
                  </div>
                ) : finalRows.length === 0 ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                    {t("bulkGrading.finalEmpty")}
                  </div>
                ) : (
                  <table className="w-full text-xs" data-testid="bulk-grade-final-results">
                    <thead className="bg-background">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-1 pr-2 font-normal">{t("bulkGrading.tableHeaderStudent")}</th>
                        <th className="pb-1 pr-2 font-normal">{t("bulkGrading.tableHeaderTotal")}</th>
                        <th className="pb-1 font-normal">{t("bulkGrading.tableHeaderStatus")}</th>
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
                    <th className="pb-1 pr-2 font-normal">{t("bulkGrading.tableHeaderStudent")}</th>
                    <th className="pb-1 pr-2 font-normal">{t("bulkGrading.tableHeaderQuestion")}</th>
                    <th className="pb-1 pr-2 font-normal">{t("bulkGrading.tableHeaderScore")}</th>
                    <th className="pb-1 pr-2 font-normal">{t("bulkGrading.tableHeaderComment")}</th>
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
                      <td className="py-1.5 pr-2 text-muted-foreground">{t("bulkGrading.questionLabel", { number: row.qIdx + 1 })}</td>
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
                          href={
                            mode === "assignment"
                              ? `/instructor/assignment/${examId}/grade/${row.sessionId}`
                              : `/instructor/${examId}/grade/${row.sessionId}?questionType=case&qIdx=${row.qIdx}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("bulkGrading.individualGradeAriaLabel", { studentName: row.studentName, number: row.qIdx + 1 })}
                          data-testid={`bulk-grade-row-link-${row.sessionId}-${row.qIdx}`}
                          className="inline-flex items-center gap-0.5 whitespace-nowrap text-info-text hover:underline"
                        >
                          {t("bulkGrading.individualGradeLink")}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              !isGrading && (
                <p className="type-hint">
                  {t("bulkGrading.noProposedGrades")}
                </p>
              )
            )}

            {/* Footer: 채점 확정 (재가채점은 입력창 위 버튼으로 일원화) */}
            {showCommit && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button
                  type="button"
                  onClick={handleCommit}
                  disabled={commitMutation.isPending}
                >
                  {commitMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("bulkGrading.savingLabel")}
                    </>
                  ) : (
                    t("bulkGrading.commitButton", { count: totalGrades })
                  )}
                </Button>
              </div>
            )}
            {committed && (
              <div className="border-t pt-3 text-xs text-muted-foreground">
                {t("bulkGrading.committedMsg")}
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
      aria-label={t("bulkGrading.panelAriaLabel", { gradeNoun })}
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex h-full w-[528px] max-w-full flex-col overflow-hidden border-l bg-background shadow-lg",
        "transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">{t("bulkGrading.panelTitle", { gradeNoun })}</h2>
        {data?.studentCount != null && (
          <span className="text-xs font-normal text-muted-foreground">
            {t("bulkGrading.panelSubtitle", { count: data.studentCount })}
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={t("bulkGrading.closeAriaLabel")}
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
              {t("bulkGrading.loadingMsg")}
            </div>
          ) : !hasThreadContent ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="type-hint">
                {t("bulkGrading.preparingMsg")}
              </p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="bulk-grade-thread">
              {chatLoading && chatMessageCount === 0 && (
                <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  {t("bulkGrading.chatLoadingMsg")}
                </div>
              )}
              {threadItems.map((item) => (
                <div key={item.key}>{item.render()}</div>
              ))}
              {data?.warning && (
                <p className="text-xs text-warning-text">{data.warning}</p>
              )}
            </div>
          )}
        </div>

        {showJumpToBottom && (
          <button
            type="button"
            aria-label={t("bulkGrading.jumpToBottomAriaLabel")}
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs shadow-md hover:bg-muted"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            {t("bulkGrading.jumpToBottomLabel")}
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t px-5 py-3">
        {/* 재가채점 — 가채점 완료 상태에서 입력창 바로 위에 상시 노출 */}
        {canRegradeArm && !regradeArmed && (
          <div className="mb-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={armRegrade}
              data-testid="bulk-grade-regrade-arm"
              className="w-full justify-center"
            >
              {t("bulkGrading.regradeArmButton")}
            </Button>
          </div>
        )}

        {regradeArmed && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-warning-border bg-warning-surface px-3 py-1.5 text-xs text-warning-text">
            <span className="flex-1">
              {t("bulkGrading.regradeArmedNotice")}
            </span>
            <button
              type="button"
              onClick={cancelRegrade}
              className="font-medium underline-offset-2 hover:underline"
            >
              {t("bulkGrading.cancelRegrade")}
            </button>
          </div>
        )}

        {canProceedToGrading && !interviewReady && !gradingAttempted && !committed && (
          <div className="mb-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => completeInterviewMutation.mutate()}
              disabled={
                completeInterviewMutation.isPending ||
                chatMutation.isPending ||
                initChatMutation.isPending
              }
              data-testid="bulk-grade-proceed-to-scoring"
              className="w-full justify-center"
            >
              {completeInterviewMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("bulkGrading.proceedButton")}
                </>
              ) : (
                t("bulkGrading.proceedGradingButton")
              )}
            </Button>
          </div>
        )}

        {interviewReady && !gradingAttempted && !committed && (
          <p className="mb-2 text-xs text-muted-foreground">
            {t("bulkGrading.interviewReadyNotice", { gradeNoun })}
          </p>
        )}

        {/* Quick-reply 보기 칩 — AI가 질문하면 phase 무관하게 표시 */}
        {canShowChips &&
          (chatOptionsMutation.isPending || displayedOptions.length > 0) && (
            <div className="mb-2">
              {chatOptionsMutation.isPending ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("bulkGrading.optionsGenerating")}
                </div>
              ) : (
                <div
                  className="flex flex-col gap-2"
                  role="group"
                  aria-label={t("bulkGrading.optionsAriaLabel")}
                >
                  {displayedOptions.map((label, optIdx) => (
                    <button
                      key={`pick-${optIdx}-${label}`}
                      type="button"
                      onClick={() => handleOptionPick(label)}
                      disabled={
                        chatMutation.isPending || startGradingMutation.isPending
                      }
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 text-xs font-semibold text-muted-foreground"
                      >
                        {optIdx + 1}
                      </span>
                      <span className="flex-1">{label}</span>
                    </button>
                  ))}
                </div>
              )}
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
                ? t("bulkGrading.placeholderStart")
                : interviewInProgress
                  ? t("bulkGrading.placeholderInterview")
                  : t("bulkGrading.placeholderDefault")
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
                        <span className="type-meta">
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
              aria-label={
                sendMode === "start"
                  ? t("bulkGrading.sendAriaLabelStart", { gradeNoun })
                  : t("bulkGrading.sendAriaLabelDiscuss")
              }
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
