"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Exam {
  id: string;
  title: string;
  code: string;
  type: string;
  deadline: string | null;
  questions: unknown[];
  rubric: unknown[];
  assignment_prompt: string | null;
  status: string;
  materials: string[];
}

interface Session {
  id: string;
  status: string;
  submitted_at: string | null;
  final_answer: string | null;
  final_answer_updated_at: string | null;
}

export function useAssignmentSession(code: string) {
  const { user, profile, isLoaded, isSignedIn } = useAppUser();
  const router = useRouter();
  const t = useTranslations("assignment.page");
  const [exam, setExam] = useState<Exam | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 서버 오류 코드를 사용자 문구로 옮긴다.
  //
  // 예전에는 errData.message 를 그대로 던져서 한도 오류가 영문 원문으로
  // 화면에 떴다. 코드를 아는 만큼만 번역하고 나머지는 기본 문구로 간다.
  const resolveErrorMessage = useCallback(
    (code: unknown): string => {
      const known: Record<string, string> = {
        ENTRY_WINDOW_NOT_OPEN: t("entryWindowNotOpen"),
        EXAM_NOT_AVAILABLE: t("examNotAvailable"),
        EXAM_NOT_FOUND: t("examNotFound"),
        PUBLISH_LIMIT_REACHED: t("publishLimitReached"),
        STUDENT_LIMIT_REACHED: t("studentLimitReached"),
        // 한도 판정이 잠시 불가능한 상태다 (#326). 정원이 찬 것도, 세션
        // 생성이 실패한 것도 아니다 — 잠시 뒤 다시 시도하면 들어간다.
        // 일반 "세션 초기화 실패" 로 뭉개면 학생이 다시 시도하지 않는다.
        // 같은 매핑이 hooks/useExamSession.ts 에 있는데 이 형제만 빠져 있었다.
        QUOTA_CHECK_UNAVAILABLE: t("quotaUnavailable"),
      };
      return (typeof code === "string" && known[code]) || t("sessionInitError");
    },
    [t]
  );

  const initSession = useCallback(async () => {
    if (!isLoaded || !isSignedIn || !user) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch exam by code
      const examRes = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_exam", data: { code } }),
      });

      if (!examRes.ok) {
        // 서버 message 를 그대로 화면에 올리면 영문 원문이 노출된다.
        // 코드로 문구를 고르고, 모르는 코드는 기본 문구로 떨어뜨린다.
        const errData = await examRes.json().catch(() => ({}));
        throw new Error(resolveErrorMessage(errData?.error));
      }

      const examData = await examRes.json();
      const fetchedExam = examData.exam;

      if (!fetchedExam || !fetchedExam.type || fetchedExam.type === "exam") {
        router.replace(`/exam/${code}`);
        return;
      }

      setExam(fetchedExam);

      // Init session via existing initExamSession
      const sessionRes = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init_exam_session",
          data: { examCode: code, studentId: user.id },
        }),
      });

      if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => ({}));
        // 마감으로 입장이 막힌 경우: 본인 기록을 읽기 전용으로 보여주는 열람 페이지로 유도
        if (errData.error === "ENTRY_WINDOW_CLOSED") {
          router.replace(`/assignment/${code}/review`);
          return null;
        }
        throw new Error(resolveErrorMessage(errData?.error));
      }

      const sessionData = await sessionRes.json();
      const sessionId = sessionData.session?.id;
      setSession({
        id: sessionId,
        status: sessionData.sessionStatus || sessionData.session?.status || "in_progress",
        submitted_at: sessionData.session?.submitted_at || null,
        final_answer: sessionData.session?.final_answer ?? null,
        final_answer_updated_at: sessionData.session?.final_answer_updated_at ?? null,
      });

      if (sessionId) {
        // Load existing messages
        const msgRes = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_session_messages",
            data: { sessionId },
          }),
        });

        if (msgRes.ok) {
          const msgData = await msgRes.json();
          return {
            sessionId,
            existingMessages: msgData.messages || [],
          };
        }
      }

      return { sessionId, existingMessages: [] };
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sessionInitError"));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [code, isLoaded, isSignedIn, user, router]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  return {
    exam,
    session,
    isLoading,
    error,
    userId: user?.id || "",
  };
}
