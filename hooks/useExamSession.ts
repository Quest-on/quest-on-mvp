"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  // 데모 재응시 의도. CTA 가 붙인 `?restartDemo=1` 로만 들어온다.
  const restartDemo = searchParams.get("restartDemo") === "1";

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
  //
  // 교수자가 자기 데모를 학생 시점으로 겪는 경우(AC-7)는 우회한다.
  // 데모 미리보기 여부는 서버가 init 응답의 demoPreview 로 남긴다 — 클라이언트가
  // is_demo 를 스스로 판정하면 남의 데모나 일반 시험까지 우회될 수 있다.
  // 그래서 게이트는 init 결과를 기다렸다가 demoPreview 가 아닐 때만 리다이렉트한다.
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

  // Session init query (게이트보다 먼저 선언 — 데모 미리보기 판정을 써야 한다)
  const { data: initData, isLoading: initLoading } = useQuery({
    // 재응시 여부를 키에 넣는다. 안 넣으면 같은 캐시를 재사용해 "다시 해보기"가
    // 앞선 읽기 전용 응답을 그대로 돌려준다.
    queryKey: ["exam-session-init", examCode, user?.id, restartDemo],
    queryFn: async () => {
      try {
        const deviceFingerprint = getDeviceFingerprint();
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "init_exam_session",
            // 데모 재응시는 CTA 가 붙인 쿼리 파라미터로만 요청된다. 서버는 이
            // 값을 신뢰하지 않고 데모 소유자일 때만 실제로 초기화한다 —
            // 여기서 안 실어 보내면 "다시 해보기"가 조용히 무시된다.
            data: {
              examCode,
              studentId: user!.id,
              deviceFingerprint,
              ...(restartDemo ? { restartDemoAttempt: true } : {}),
            },
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
    // 데모 미리보기는 서버가 init 에서 판정한다. 그래서 init 은 프로필 게이트를
    // 기다리지 않고 돌린다 — 학생이면 게이트가 어차피 통과하고, 데모 소유자면
    // demoPreview 가 와서 게이트를 우회한다.
    enabled: !!examCode && isLoaded && !!user,
    retry: 2,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    // init 결과가 올 때까지 기다린다. 그 전에 리다이렉트하면 데모 미리보기도
    // 프로필 게이트에 걸려 튕긴다.
    if (!profileGateData || profileGateChecked) return;
    if (initData === undefined) return; // init 이 아직 안 끝났다
    if (initData.ok && initData.demoPreview) {
      // 데모 소유자는 학생 프로필이 없어도 겪게 한다.
      setProfileGateChecked(true);
      return;
    }
    if (!profileGateData.hasProfile) {
      router.replace(`/student/profile-setup?redirect=${encodeURIComponent(`/exam/${examCode}`)}`);
      return;
    }
    setProfileGateChecked(true);
  }, [profileGateData, profileGateChecked, initData, router, examCode]);

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
          // 한도 초과를 network_error 로 뭉개면 안 된다. 학생은 "네트워크 오류"를
          // 보고 새로고침만 반복하게 되고, 실제 원인(교수자 계정 인증 필요)이
          // 전달되지 않는다.
          PUBLISH_LIMIT_REACHED: "publish_limit",
          STUDENT_LIMIT_REACHED: "student_limit",
        };
        const errorParam = errorCodeMap[errorData.error] || "network_error";
        // 시험 코드를 함께 넘긴다. 지금은 리다이렉트 후 코드가 빈 값이라
        // "같은 코드로 다시 시도"가 불가능하다 — 학생이 코드를 다시 받아야 한다.
        router.push(`/join?error=${errorParam}&code=${encodeURIComponent(examCode)}`);
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
    // 데모 미리보기 여부와 그 시험 id. 응시를 마친 교수자를 학생 대시보드가
    // 아니라 데모 상세로 돌려보내는 데 쓴다 — 자기 데모를 연습하고 나서
    // /student 로 버려지면 다음에 뭘 해야 할지 알 수 없다.
    demoPreview: initData?.ok === true && initData.demoPreview === true,
    demoExamId: initData?.ok === true ? (initData.exam?.id ?? null) : null,
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
