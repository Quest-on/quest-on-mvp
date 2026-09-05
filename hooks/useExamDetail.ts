"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import type { InstructorExam, InstructorStudent } from "@/lib/types/exam";

interface Question {
  id: string;
  text: string;
  type: string;
}

interface UseExamDetailOptions {
  examId: string;
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | undefined;
}

export function useExamDetail({
  examId,
  isLoaded,
  isSignedIn,
  userId,
}: UseExamDetailOptions) {
  const [exam, setExam] = useState<InstructorExam | null>(null);

  const { data: examDetailData, isLoading: examDetailLoading, isFetching: examDetailFetching, error: examDetailError } = useQuery({
    queryKey: qk.instructor.examDetail(examId),
    queryFn: async () => {
      const PAGE_SIZE = 100; // API maximum per page

      // exam fetch와 sessions 첫 페이지 fetch를 병렬로 실행
      const [examResponse, firstPageResponse] = await Promise.all([
        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_exam_by_id",
            data: { id: examId },
          }),
        }),
        fetch(`/api/exam/${examId}/sessions?page=1&pageSize=${PAGE_SIZE}`),
      ]);

      if (!examResponse.ok) {
        throw new Error(
          `Failed to fetch exam details: ${examResponse.status} ${examResponse.statusText}`
        );
      }

      const examResult = await examResponse.json();
      const questionsArray = examResult.exam.questions || [];
      let students: InstructorStudent[] = [];

      if (!firstPageResponse.ok) {
        throw new Error(
          `Failed to fetch exam sessions: ${firstPageResponse.status} ${firstPageResponse.statusText}`
        );
      }

      const firstPageData = await firstPageResponse.json();
      const allSessions: Record<string, unknown>[] = [...(firstPageData.sessions ?? [])];

      // 2페이지 이상 있으면 순차 fetch
      const totalPages: number = firstPageData.pagination?.totalPages ?? 1;
      for (let page = 2; page <= totalPages; page++) {
        const pageRes = await fetch(`/api/exam/${examId}/sessions?page=${page}&pageSize=${PAGE_SIZE}`);
        if (!pageRes.ok) {
          throw new Error(
            `Failed to fetch exam sessions page ${page}: ${pageRes.status} ${pageRes.statusText}`
          );
        }
        const pageData = await pageRes.json();
        allSessions.push(...(pageData.sessions ?? []));
      }

      const sessionsByStudent = new Map<string, Array<Record<string, unknown>>>();

      const ACTIVE_STATUSES = ["in_progress", "quiz_pending", "submitted", "auto_submitted"];
      allSessions
        .filter((session: Record<string, unknown>) => {
          const status = typeof session.status === "string" ? session.status : "";
          return ACTIVE_STATUSES.includes(status);
        })
        .forEach((session: Record<string, unknown>) => {
          const studentId =
            typeof session.student_id === "string" ? session.student_id : "";
          if (!sessionsByStudent.has(studentId)) {
            sessionsByStudent.set(studentId, []);
          }
          sessionsByStudent.get(studentId)?.push(session);
        });

      students = Array.from(sessionsByStudent.entries()).map(
        ([studentId, sessions]) => {
          const submittedSessions = sessions
            .filter((s) => s.submitted_at != null)
            .sort((a, b) => {
              const aDate = a.submitted_at ? new Date(a.submitted_at as string).getTime() : 0;
              const bDate = b.submitted_at ? new Date(b.submitted_at as string).getTime() : 0;
              return bDate - aDate;
            });

          const unsubmittedSessions = sessions
            .filter((s) => s.submitted_at == null)
            .sort((a, b) => {
              const aDate = a.created_at ? new Date(a.created_at as string).getTime() : 0;
              const bDate = b.created_at ? new Date(b.created_at as string).getTime() : 0;
              return bDate - aDate;
            });

          const selectedSession =
            submittedSessions.length > 0
              ? submittedSessions[0]
              : unsubmittedSessions.length > 0
              ? unsubmittedSessions[0]
              : sessions[0];

          const sessionId = typeof selectedSession.id === "string" ? selectedSession.id : "";
          const submittedAt =
            selectedSession.submitted_at != null
              ? typeof selectedSession.submitted_at === "string"
                ? selectedSession.submitted_at
                : String(selectedSession.submitted_at)
              : undefined;

          const studentName =
            typeof selectedSession.student_name === "string"
              ? selectedSession.student_name
              : `Student ${studentId.slice(0, 8)}`;
          const studentEmail =
            typeof selectedSession.student_email === "string"
              ? selectedSession.student_email
              : `${studentId}@example.com`;

          const createdAt =
            selectedSession.created_at != null
              ? typeof selectedSession.created_at === "string"
                ? selectedSession.created_at
                : String(selectedSession.created_at)
              : undefined;

          // 과제(assignment) 확정 점수 — sessions API가 채워줄 때만 존재.
          // 시험은 score/is_graded를 안 내려보내므로 undefined/false로 유지된다.
          const confirmedScore =
            typeof selectedSession.score === "number"
              ? selectedSession.score
              : undefined;
          const isGraded = selectedSession.is_graded === true;
          const autoSubmitted = selectedSession.auto_submitted === true;

          return {
            id: sessionId,
            name: studentName,
            email: studentEmail,
            status: submittedAt ? "completed" : "in-progress",
            score: confirmedScore,
            finalScore: confirmedScore,
            submittedAt: submittedAt as string | undefined,
            createdAt: createdAt as string | undefined,
            autoSubmitted,
            student_number:
              typeof selectedSession.student_number === "string"
                ? selectedSession.student_number
                : undefined,
            school:
              typeof selectedSession.student_school === "string"
                ? selectedSession.student_school
                : undefined,
            questionCount: undefined,
            answerLength: undefined,
            isGraded,
            gradingProgress:
              (selectedSession.grading_progress as InstructorStudent["gradingProgress"]) ?? null,
          } as InstructorStudent;
        }
      );

      return {
        exam: {
          id: examResult.exam.id,
          title: examResult.exam.title,
          code: examResult.exam.code,
          description: examResult.exam.description,
          duration: examResult.exam.duration,
          status: examResult.exam.status,
          createdAt: examResult.exam.created_at,
          questions: [],
          students,
          open_at: examResult.exam.open_at || null,
          close_at: examResult.exam.close_at || null,
          started_at: examResult.exam.started_at || null,
          deadline: examResult.exam.deadline || null,
          assignment_prompt: examResult.exam.assignment_prompt || null,
          grades_released: examResult.exam.grades_released || false,
          is_demo: examResult.exam.is_demo === true,
          first_published_at: examResult.exam.first_published_at ?? null,
        } as InstructorExam,
        questionsCount: questionsArray.length,
        questionsRaw: questionsArray as Question[],
      };
    },
    enabled: !!examId && !!isLoaded && !!isSignedIn && !!userId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const isSwitchingExam = !!exam && exam.id !== examId;
  const loading =
    examDetailLoading ||
    examDetailFetching ||
    isSwitchingExam ||
    (!exam && !examDetailError);
  const error = examDetailError instanceof Error
    ? examDetailError.message
    : examDetailError
    ? "Failed to load exam data"
    : null;

  useEffect(() => {
    setExam(null);
  }, [examId]);

  useEffect(() => {
    if (!examDetailData?.exam) return;
    setExam((prev) => {
      if (!prev || prev.id !== examDetailData.exam.id) return examDetailData.exam; // 최초 로드/시험 전환
      return {
        ...prev,
        students: examDetailData.exam.students,
        grades_released: examDetailData.exam.grades_released,
      };
    });
  }, [examDetailData]);

  return {
    exam,
    setExam,
    examDetailData,
    examDetailLoading,
    examDetailFetching,
    examDetailError,
    loading,
    error,
  };
}
