"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  MessageSquare,
  Send,
  X,
} from "lucide-react";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { extractErrorMessage } from "@/lib/error-messages";
import type { ProposedGradesMap } from "@/lib/bulk-grading";

type PermissionKey = "review_before_commit" | "no_precheck" | "ai_default";

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  review_before_commit: "채점전 승인 받기",
  no_precheck: "묻지 않고 채점 진행",
  ai_default: "AI한테 다 맡기기",
};

const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  review_before_commit: "입력한 기준으로 가채점 후 검토하고 확정합니다",
  no_precheck: "사전 확인 없이 바로 가채점을 진행합니다",
  ai_default: "기준 없이 AI 기본 기준으로 가채점합니다",
};

type BulkGradeProgress = {
  total: number;
  completed: number;
  failed: number;
};

type BulkGradeSession = {
  id: string;
  proposed_grades: ProposedGradesMap;
  status: string;
  committed_at: string | null;
  updated_at: string;
  grading_scope?: string;
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

function BulkGradeChatSection({
  messages,
  isLoading,
  draft,
  onDraftChange,
  onSubmit,
  isSubmitting,
}: {
  messages: BulkGradeChatMessage[];
  isLoading: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
}) {
  return (
    <section
      className="space-y-3 border-t pt-4"
      aria-label="CASE 가채점 대화"
      data-testid="bulk-grade-chat"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-medium">결과 대화</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">토론 전용</span>
      </div>

      <div
        className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3"
        data-testid="bulk-grade-chat-messages"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            대화 불러오는 중...
          </div>
        ) : messages.length === 0 ? (
          <p className="py-5 text-center text-xs text-muted-foreground">
            아직 대화가 없습니다.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-md px-3 py-2 text-xs leading-relaxed",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground shadow-sm",
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-2">
        <div className="rounded-md border bg-background px-3 pb-2 pt-3 shadow-sm focus-within:ring-1 focus-within:ring-ring">
          <Textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="가채점 기준, 결과 해석, 검토 관점을 질문하세요."
            disabled={isSubmitting}
            data-testid="bulk-grade-chat-input"
            className="min-h-[76px] resize-none border-0 p-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-[11px] text-muted-foreground">
              점수 변경은 결과 표 입력과 확정 버튼으로만 반영됩니다.
            </p>
            <Button
              type="submit"
              size="icon"
              aria-label="가채점 대화 전송"
              disabled={!draft.trim() || isSubmitting}
              className="h-8 w-8 rounded-lg"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

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
  const [criteriaText, setCriteriaText] = useState("");
  const [criteriaMode, setCriteriaMode] = useState<"custom" | "ai_default">("custom");
  const [approvalMode, setApprovalMode] = useState<"review_before_commit" | "no_precheck">(
    "review_before_commit",
  );
  const [editedGrades, setEditedGrades] = useState<ProposedGradesMap | null>(null);
  const [chatDraft, setChatDraft] = useState("");

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
      setChatDraft("");
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
  const progress = data?.session?.progress;
  const hasProgress = !!progress && progress.total > 0;
  const processedCount = progress
    ? Math.min(progress.total, progress.completed + progress.failed)
    : 0;
  const progressPercent = hasProgress
    ? Math.round((processedCount / Math.max(progress.total, 1)) * 100)
    : 0;
  const hasPartialFailure = gradingDone && (progress?.failed ?? 0) > 0;
  const reviewComplete = gradingDone || committed;
  const serverGrades = data?.session?.proposed_grades;
  const currentGrades = editedGrades ?? serverGrades ?? null;
  const reviewGrades = committed ? null : currentGrades;
  const canStartGrading = !isGrading && !committed;
  const studentsBySessionId = useMemo(() => {
    return new Map(
      (data?.students ?? []).map((student, index) => [
        student.sessionId,
        { student, index },
      ]),
    );
  }, [data?.students]);

  const startGradingMutation = useMutation({
    mutationFn: async () => {
      const criteria = criteriaMode === "ai_default" ? "" : criteriaText.trim();
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
      const studentMeta = [student?.studentNumber, student?.school, student?.email]
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
      setCriteriaText("");
      setApprovalMode("review_before_commit");
    } else if (value === "no_precheck") {
      setCriteriaMode("custom");
      setApprovalMode("no_precheck");
    } else {
      setCriteriaMode("custom");
      setApprovalMode("review_before_commit");
    }
  };

  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatDraft.trim();
    if (!message || chatMutation.isPending) return;
    chatMutation.mutate(message);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const startDisabled = isGrading || committed || startGradingMutation.isPending;

  return (
    <aside
      role="complementary"
      aria-label="CASE AI 가채점"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-[480px] max-w-full flex-col border-l bg-background shadow-lg",
        "transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
        <div className="flex shrink-0 flex-col gap-2 border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">CASE AI 가채점</h2>
            {data?.studentCount != null && (
              <span className="text-sm font-normal text-muted-foreground">
                (대상: {data.studentCount}명)
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

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={!isGrading && !reviewComplete ? "font-medium text-primary" : ""}>
              ① 기준 입력
            </span>
            <span>→</span>
            <span className={isGrading ? "font-medium text-primary" : reviewComplete ? "font-medium text-green-600" : ""}>
              {isGrading ? "② 전체 가채점 중" : reviewComplete ? "② 가채점 완료" : "② 전체 가채점"}
            </span>
            <span>→</span>
            <span className={committed ? "font-medium text-green-600" : ""}>③ 확정</span>
          </div>

          {isGrading && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="font-medium">전체 CASE 답안을 백그라운드에서 가채점 중입니다.</span>
              </div>
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                창을 닫아도 계속 진행됩니다. 완료 후 제안 점수를 검토하고 확정할 수 있습니다.
              </p>
            </div>
          )}

          {isGrading && hasProgress && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-xs text-muted-foreground">
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

          {gradingDone && progress && progress.failed === 0 && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>AI 제안 점수 생성이 완료되었습니다. 검토 후 확정하세요.</span>
            </div>
          )}

          {committed && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>CASE 채점이 확정되었습니다. 총점은 학생 목록에서 확인하고 대화 기록은 여기서 계속 볼 수 있습니다.</span>
            </div>
          )}

          {(gradingFailed || hasPartialFailure) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                일부 CASE 가채점이 완료되지 않았습니다. 다시 시작하면 이전 제안 점수를 초기화하고 새로 생성합니다.
              </p>
            </div>
          )}

          {data?.warning && <p className="text-sm text-amber-600">{data.warning}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          ) : (
            <div className="space-y-5">
              {gradeRows.length === 0 ? (
                committed ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                    확정된 총점은 학생 목록에서 확인하세요. 이 패널에서는 가채점 대화 기록을 계속 확인할 수 있습니다.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="text-sm font-medium">채점 기준</label>
                    <div className="rounded-xl border bg-background px-3 pb-2 pt-3 shadow-sm focus-within:ring-1 focus-within:ring-ring">
                      <Textarea
                        value={criteriaText}
                        onChange={(e) => {
                          setCriteriaText(e.target.value);
                          if (e.target.value.trim()) setCriteriaMode("custom");
                        }}
                        placeholder='예: "논리적 근거 제시 40%, 답변 완성도 30%, 핵심 개념 활용 30%. 부분 점수 허용."'
                        disabled={startDisabled}
                        className="min-h-[120px] resize-none border-0 p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                      />

                      <div className="flex items-center justify-between gap-2 pt-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={startDisabled}
                              className="h-8 gap-1 px-2 text-muted-foreground"
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
                          aria-label={`전체 CASE 가채점 시작 (${data?.studentCount ?? 0}명)`}
                          onClick={() => startGradingMutation.mutate()}
                          disabled={startDisabled}
                          className="h-8 w-8 rounded-lg"
                        >
                          {startGradingMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowUp className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      입력한 자연어 기준으로 전체 CASE 답안을 바로 가채점합니다. 입력이 비어 있거나 AI한테 다 맡기기를 선택하면 AI 기본 기준을 사용합니다.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    {committed ? "확정된 CASE 채점 기록" : "전체 CASE 제안 점수"} ({totalGrades}개)
                  </p>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-1 pr-2 font-normal">학생</th>
                        <th className="pb-1 pr-2 font-normal">문제</th>
                        <th className="pb-1 pr-2 font-normal">점수</th>
                        <th className="pb-1 pr-2 font-normal">코멘트</th>
                        {!committed && <th className="pb-1 font-normal"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {gradeRows.map((row) => (
                        <tr key={`${row.sessionId}-${row.qIdx}`} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">
                            <div className="font-medium text-foreground">{row.studentName}</div>
                            {row.studentMeta && (
                              <div className="max-w-[140px] truncate text-[11px] text-muted-foreground" title={row.studentMeta}>
                                {row.studentMeta}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-muted-foreground">Q{row.qIdx + 1}</td>
                          <td className="py-1.5 pr-2">
                            {committed ? (
                              <span className="inline-flex min-w-10 justify-end tabular-nums">
                                {row.score}
                              </span>
                            ) : (
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
                            )}
                          </td>
                          <td className="max-w-[220px] truncate py-1.5 pr-2 text-muted-foreground" title={row.comment}>
                            {row.comment}
                          </td>
                          {!committed && (
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
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <BulkGradeChatSection
                messages={chatData?.messages ?? []}
                isLoading={chatLoading}
                draft={chatDraft}
                onDraftChange={setChatDraft}
                onSubmit={handleChatSubmit}
                isSubmitting={chatMutation.isPending}
              />
            </div>
          )}
        </div>

        {!committed && (isGrading || gradingDone) && (
        <div className="flex shrink-0 flex-col gap-2 border-t px-6 py-4">
          {isGrading && (
            <Button type="button" variant="secondary" className="w-full" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              전체 CASE 가채점 중
            </Button>
          )}

          {canStartGrading && gradingDone && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => startGradingMutation.mutate()}
              disabled={startGradingMutation.isPending}
            >
              전체 CASE 다시 가채점
            </Button>
          )}

          {gradingDone && currentGrades && Object.keys(currentGrades).length > 0 && !isGrading && (
            <Button
              type="button"
              className="w-full"
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
        </div>
        )}
    </aside>
  );
}
