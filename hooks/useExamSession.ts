"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { createSupabaseClient } from "@/lib/supabase-client";
import { hasAiChatQuestions } from "@/lib/grading-helpers";

interface Question {
  id: string;
  text: string;
  type: string;
  points: number;
  title?: string;
  ai_context?: string;
}

interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: Question[];
  status: string;
  startTime?: string;
  endTime?: string;
  rubric?: Array<{
    id?: string;
    evaluationArea: string;
    detailedCriteria: string;
  }>;
  rubric_public?: boolean;
  allow_draft_in_waiting?: boolean;
  allow_chat_in_waiting?: boolean;
}

interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

interface ChatMessage {
  type: "user" | "assistant";
  message: string;
  timestamp: string;
  qIdx: number;
}

interface UseExamSessionOptions {
  examCode: string;
  examId: string | null;
  user: { id: string } | null | undefined;
  isLoaded: boolean;
  // State setters owned by the page component
  setExam: (exam: Exam | null) => void;
  setSessionId: (id: string | null) => void;
  setDraftAnswers: (answers: DraftAnswer[]) => void;
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  saveViaBeacon: () => void;
}

export function useExamSession({
  examCode,
  examId,
  user,
  isLoaded,
  setExam,
  setSessionId,
  setDraftAnswers,
  setChatHistory,
  saveViaBeacon,
}: UseExamSessionOptions) {
  const router = useRouter();

  // Session-specific state (not shared with other hooks)
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [examInitialized, setExamInitialized] = useState(false);
  const [showPreflight, setShowPreflight] = useState(false);
  // AI 사용 고지를 이미 확인한 학생인지 (AC-15). 서버가 onboarding_events 로
  // 판정한 값이라 클라이언트가 뒤집지 않는다.
  const [disclosureAcknowledged, setDisclosureAcknowledged] = useState(false);
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(false);
  const [isLateEntry, setIsLateEntry] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  // Internal refs for beforeunload (track latest values)
  const sessionIdRef = useRef<string | null>(null);
  const [heartbeatSessionId, setHeartbeatSessionId] = useState<string | null>(null);
  const isSubmittedRef = useRef(false);
  isSubmittedRef.current = isSubmitted;

  const saveViaBeaconRef = useRef(saveViaBeacon);
  saveViaBeaconRef.current = saveViaBeacon;

  const autoSubmitHandledRef = useRef(false);

  // Profile gate
  const [profileGateChecked, setProfileGateChecked] = useState(false);
  const { data: profileGateData } = useQuery({
    queryKey: ["student-profile-gate", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/student/profile");
      if (!response.ok) return { hasProfile: false };
      const data = await response.json();
      return { hasProfile: !!data.profile };
    },
    enabled: !!user && isLoaded,
    retry: 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!profileGateData || profileGateChecked) return;
    if (!profileGateData.hasProfile) {
      router.replace(`/student/profile-setup?redirect=${encodeURIComponent(`/exam/${examCode}`)}`);
      return;
    }
    setProfileGateChecked(true);
  }, [profileGateData, profileGateChecked, router, examCode]);

  // Session init query
  const { data: initData, isLoading: initLoading } = useQuery({
    queryKey: ["exam-session-init", examCode, user?.id],
    queryFn: async () => {
      try {
        const deviceFingerprint = getDeviceFingerprint();
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "init_exam_session",
            data: { examCode, studentId: user!.id, deviceFingerprint },
          }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return { ok: false as const, errorData };
        }
        return { ok: true as const, ...(await response.json()) };
      } catch {
        return { ok: false as const, errorData: { error: "NETWORK_ERROR" } };
      }
    },
    enabled: !!examCode && isLoaded && !!user && profileGateChecked,
    retry: 2,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  });

  const examLoading = initLoading || (!examInitialized && !initData);

  // Process init data — sets external state via setters
  useEffect(() => {
    if (!initData) return;

    if (!initData.ok) {
      const { errorData } = initData;
      if (errorData.error === "Exam already submitted" || errorData.isRetakeBlocked) {
        router.push("/join?error=already_submitted");
      } else {
        const errorCodeMap: Record<string, string> = {
          UNAUTHORIZED: "unauthorized",
          EXAM_NOT_FOUND: "exam_not_found",
          EXAM_NOT_AVAILABLE: "exam_not_available",
          ENTRY_WINDOW_CLOSED: "entry_window_closed",
          INIT_SESSION_FAILED: "server_error",
          NETWORK_ERROR: "network_error",
        };
        const errorParam = errorCodeMap[errorData.error] || "network_error";
        router.push(`/join?error=${errorParam}`);
      }
      return;
    }

    if (!initData.exam) {
      router.push("/join?error=exam_not_found");
      return;
    }

    setExam(initData.exam);

    if (initData.isRetakeBlocked) {
      setIsSubmitted(true);
      setSessionId(initData.session.id);
      sessionIdRef.current = initData.session.id;
      setHeartbeatSessionId(initData.session.id);
      if (initData.messages) setChatHistory(initData.messages);
      setExamInitialized(true);
      return;
    }

    if (initData.autoSubmitted || initData.timeExpired) {
      setIsSubmitted(true);
      setSessionId(initData.session.id);
      sessionIdRef.current = initData.session.id;
      setHeartbeatSessionId(initData.session.id);
      if (initData.messages) setChatHistory(initData.messages);
      setExamInitialized(true);
      return;
    }

    // Initialize draft answers
    const submissions = initData.submissions || [];
    setDraftAnswers(
      initData.exam.questions.map((q: Question, index: number) => {
        const submission = submissions.find(
          (sub: { q_idx: number; answer: string }) => sub.q_idx === index
        );
        return { questionId: q.id, text: submission?.answer || "" };
      })
    );

    setDisclosureAcknowledged(initData.disclosureAcknowledged === true);

    if (initData.session) {
      setSessionId(initData.session.id);
      sessionIdRef.current = initData.session.id;
      setHeartbeatSessionId(initData.session.id);

      const currentSessionStatus =
        initData.sessionStatus || initData.session.status || "not_joined";
      setSessionStatus(currentSessionStatus);

      // 세션 수락 여부와 사람 단위 고지 확인은 별개다. 전자만 보면 레거시
      // 장기 세션과 지각 입장이 AI 고지를 건너뛴다.
      const needsPreflightStatuses = new Set([
        "joined",
        "waiting",
        "late_pending",
        "in_progress",
      ]);
      const completedSessionStatuses = new Set(["submitted", "auto_submitted"]);
      const needsDisclosureAcknowledgement =
        hasAiChatQuestions(initData.exam.questions) &&
        !initData.disclosureAcknowledged;
      if (
        needsPreflightStatuses.has(currentSessionStatus) &&
        !completedSessionStatuses.has(currentSessionStatus) &&
        !initData.session.submitted_at &&
        (!initData.session.preflight_accepted_at || needsDisclosureAcknowledgement)
      ) {
        setShowPreflight(true);
      }

      if (currentSessionStatus === "waiting") {
        setIsInWaitingRoom(true);
      }

      if (currentSessionStatus === "late_pending") {
        setIsLateEntry(true);
      }

      if (initData.sessionStartTime) {
        setSessionStartTime(initData.sessionStartTime);
      } else if (initData.session.created_at) {
        setSessionStartTime(initData.session.created_at);
      }

      if (initData.timeRemaining !== undefined) {
        setTimeRemaining(initData.timeRemaining);
      }

      if (initData.session.submitted_at) {
        setIsSubmitted(true);
      }

      if (initData.messages) {
        setChatHistory(initData.messages);
      } else {
        setChatHistory([]);
      }
    } else {
      setSessionError(true);
    }

    if (initData.sessionReactivated) {
      toast.success("이전 세션이 복원되었습니다. 답안이 유지되어 있습니다.", {
        duration: 4000,
        icon: "🔄",
      });
    }

    setExamInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, router]);

  // Heartbeat — uses heartbeatSessionId state for reactive query key
  const { data: heartbeatData } = useQuery({
    queryKey: ["session-heartbeat", heartbeatSessionId],
    queryFn: async () => {
      const sid = heartbeatSessionId;
      if (!sid) return null;
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "session_heartbeat",
          data: { sessionId: sid, studentId: user!.id },
        }),
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!heartbeatSessionId && !!user && !isSubmitted,
    // Jitter: 25~35s to spread 100-student heartbeat load (~3 req/s vs ~7 req/s at 15s fixed)
    refetchInterval: () => 25000 + Math.random() * 10000,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (!heartbeatData) return;
    if (heartbeatData.submitted || heartbeatData.timeExpired || heartbeatData.autoSubmitted) {
      if (!autoSubmitHandledRef.current) {
        autoSubmitHandledRef.current = true;
        saveViaBeaconRef.current(); // 미저장 답안 최종 저장 시도
        setIsSubmitted(true);

        // 강사 강제 종료 시 토스트 알림
        if (heartbeatData.submitted && heartbeatData.autoSubmitted) {
          toast("교수님이 시험을 종료했습니다. 답안이 자동으로 제출되었습니다.", {
            duration: 6000,
            icon: "📋",
          });
        }
      } else {
        setIsSubmitted(true);
      }
    }
    if (heartbeatData.timeRemaining !== undefined) {
      setTimeRemaining(heartbeatData.timeRemaining);
    }
  }, [heartbeatData]);

  // Supabase Realtime: 시험 종료 즉시 감지
  useEffect(() => {
    if (!examId || isSubmitted) return;

    const supabase = createSupabaseClient();
    const channel = supabase
      .channel(`exam_end_${examId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "exams",
          filter: `id=eq.${examId}`,
        },
        (payload) => {
          if (payload.new?.status === "closed") {
            if (autoSubmitHandledRef.current) return;
            autoSubmitHandledRef.current = true;
            saveViaBeaconRef.current();
            setIsSubmitted(true);
            toast("교수님이 시험을 종료했습니다. 답안이 자동으로 제출되었습니다.", {
              duration: 6000,
              icon: "📋",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [examId, isSubmitted]);

  // sessions 테이블 Realtime 구독 — exam end 즉시 감지 (신뢰성 높음)
  useEffect(() => {
    if (!heartbeatSessionId || isSubmitted) return;

    const supabase = createSupabaseClient();
    const channel = supabase
      .channel(`session_end_${heartbeatSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${heartbeatSessionId}`,
        },
        (payload) => {
          if (payload.new?.auto_submitted === true && payload.new?.submitted_at) {
            if (autoSubmitHandledRef.current) return;
            autoSubmitHandledRef.current = true;
            saveViaBeaconRef.current();
            setIsSubmitted(true);
            toast("교수님이 시험을 종료했습니다. 답안이 자동으로 제출되었습니다.", {
              duration: 6000,
              icon: "📋",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [heartbeatSessionId, isSubmitted]);

  // Session deactivation on unload/unmount
  // Fix 2A: Read sessionIdRef.current inside handlers to avoid stale closure
  useEffect(() => {
    if (!user || isSubmitted) return;

    const handleBeforeUnload = () => {
      const currentSid = sessionIdRef.current;
      if (!currentSid) return;

      saveViaBeaconRef.current();

      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/supa",
          JSON.stringify({
            action: "deactivate_session",
            data: { sessionId: currentSid, studentId: user.id },
          })
        );
      } else {
        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deactivate_session",
            data: { sessionId: currentSid, studentId: user.id },
          }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      const currentSid = sessionIdRef.current;
      if (currentSid && !isSubmittedRef.current) {
        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deactivate_session",
            data: { sessionId: currentSid, studentId: user.id },
          }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [user, isSubmitted]);

  return {
    sessionStartTime,
    timeRemaining,
    isSubmitted,
    setIsSubmitted,
    showPreflight,
    disclosureAcknowledged,
    setShowPreflight,
    isInWaitingRoom,
    setIsInWaitingRoom,
    isLateEntry,
    setIsLateEntry,
    sessionError,
    setSessionError,
    examInitialized,
    examLoading,
    sessionStatus,
    setSessionStatus,
    setTimeRemaining,
    setSessionStartTime,
  };
}
