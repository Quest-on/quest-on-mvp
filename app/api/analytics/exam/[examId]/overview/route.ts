import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { decompressData } from "@/lib/compression";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import {
  calculateScoreFromItems,
  deduplicateGrades,
  isScoringGrade,
  normalizeScoreWeights,
  type ScoreItem,
} from "@/lib/grade-utils";
import {
  gradeObjectiveAnswer,
  isObjectiveQuestion,
  normalizeQuestions,
  selectBestSubmission,
} from "@/lib/grading-helpers";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// P1-4: Lazy Supabase getter to avoid stale connections in serverless
function getSupabase() {
  return getSupabaseServer();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    // Authentication + authorization
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_ACCESS_REQUIRED", "Instructor access required", 403);
    }

    const rl = await checkRateLimitAsync(`analytics-overview:${user.id}`, RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { examId } = await params;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    // 1. 시험 정보 가져오기 (루브릭 정보 포함)
    const { data: exam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, title, code, rubric, questions, instructor_id, score_weights")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    // Verify instructor owns this exam
    if (exam.instructor_id !== user.id) {
      return errorJson("ACCESS_DENIED", "Access denied", 403);
    }

    // 시험 타입 확인: 모든 문제가 essay 타입인지 확인
    const questions = exam.questions
      ? Array.isArray(exam.questions)
        ? (exam.questions as Array<{ type?: string }>)
        : []
      : [];
    const normalizedQuestions = normalizeQuestions(exam.questions);
    const scoreWeights = normalizeScoreWeights(exam.score_weights);
    const isEssayTypeOnly =
      questions.length > 0 &&
      questions.every((q) => q.type === "essay" || !q.type);
    // essay 타입 시험에는 피드백 단계가 없음

    // 2. 학생별 최적 세션 가져오기 (DISTINCT ON으로 DB 레벨 중복 제거)
    // RPC 실패 시 기존 JS 로직으로 폴백
    let filteredSessions: Array<{
      id: string;
      student_id: string;
      used_clarifications: number;
      created_at: string;
      submitted_at: string | null;
    }>;

    const { data: rpcSessions, error: rpcError } = await getSupabase()
      .rpc("get_best_sessions_for_exam", { p_exam_id: examId });

    if (!rpcError && rpcSessions) {
      filteredSessions = rpcSessions;
    } else {
      // Fallback: 기존 JS 로직 (RPC 함수 미배포 시)
      const { data: sessions, error: sessionsError } = await getSupabase()
        .from("sessions")
        .select("id, student_id, used_clarifications, created_at, submitted_at")
        .eq("exam_id", examId)
        .order("created_at", { ascending: false });

      if (sessionsError) {
        return errorJson("FETCH_SESSIONS_FAILED", "Failed to fetch sessions", 500);
      }

      const sessionMap = new Map<string, (typeof sessions)[0]>();
      if (sessions) {
        const submittedSessions = sessions.filter((s) => s.submitted_at);
        submittedSessions.forEach((session) => {
          const existing = sessionMap.get(session.student_id);
          if (!existing || !existing.submitted_at) {
            sessionMap.set(session.student_id, session);
          } else if (session.submitted_at && existing.submitted_at) {
            if (new Date(session.submitted_at) > new Date(existing.submitted_at)) {
              sessionMap.set(session.student_id, session);
            }
          }
        });

        const unsubmittedSessions = sessions.filter((s) => !s.submitted_at);
        unsubmittedSessions.forEach((session) => {
          if (!sessionMap.has(session.student_id)) {
            sessionMap.set(session.student_id, session);
          }
        });
      }
      filteredSessions = Array.from(sessionMap.values());
    }

    // 2-1. 학생 프로필 정보 가져오기 (별도 조회)
    const studentIds = filteredSessions
      ? [...new Set(filteredSessions.map((s) => s.student_id))]
      : [];

    // 학생 프로필 맵 생성
    const studentProfileMap = new Map<
      string,
      { name: string; student_number?: string; school?: string }
    >();

    if (studentIds.length > 0) {
      const { data: studentProfiles } = await getSupabase()
        .from("student_profiles")
        .select("student_id, name, student_number, school")
        .in("student_id", studentIds);

      if (studentProfiles) {
        studentProfiles.forEach((profile) => {
          studentProfileMap.set(profile.student_id, {
            name: profile.name,
            student_number: profile.student_number || undefined,
            school: profile.school || undefined,
          });
        });
      }
    }

    if (!filteredSessions || filteredSessions.length === 0) {
      return successJson({
        examId,
        examTitle: exam.title,
        totalStudents: 0,
        submittedStudents: 0,
        averageScore: 0,
        averageQuestions: 0,
        averageAnswerLength: 0,
        averageExamDuration: 0,
        students: [],
        statistics: {
          scoreDistribution: [],
          questionCountDistribution: [],
          answerLengthDistribution: [],
          examDurationDistribution: [],
        },
        stageAnalysis: {
          averageScores: { chat: 0, answer: 0, feedback: 0 },
          comparisonData: [],
          hasFeedback: false,
        },
        rubricAnalysis: {
          averageScores: {},
          radarData: [],
        },
        questionTypeAnalysis: {
          distribution: { concept: 0, calculation: 0, strategy: 0, other: 0 },
          pieData: [],
        },
      });
    }

    // 3. Optimized: Batch fetch all data at once instead of per-session
    const sessionIds = filteredSessions.map((s) => s.id);

    // Batch fetch all grades, messages, and submissions
    const [gradesResult, messagesResult, submissionsResult] = await Promise.all(
      [
        getSupabase()
          .from("grades")
          .select("session_id, score, q_idx, stage_grading, grade_type")
          .in("session_id", sessionIds),
        getSupabase()
          .from("messages")
          .select("session_id, id, role, q_idx, message_type")
          .in("session_id", sessionIds)
          .eq("role", "user"),
        getSupabase()
          .from("submissions")
          .select("id, session_id, q_idx, answer, compressed_answer_data, created_at")
          .in("session_id", sessionIds),
      ]
    );

    const { data: allGrades } = gradesResult;
    const { data: allMessages } = messagesResult;
    const { data: allSubmissions } = submissionsResult;

    // Create maps for O(1) lookups
    const gradesBySession = new Map<string, typeof allGrades>();
    if (allGrades) {
      for (const grade of allGrades) {
        if (!gradesBySession.has(grade.session_id)) {
          gradesBySession.set(grade.session_id, []);
        }
        gradesBySession.get(grade.session_id)!.push(grade);
      }
    }

    const messagesBySession = new Map<string, typeof allMessages>();
    if (allMessages) {
      for (const message of allMessages) {
        if (!messagesBySession.has(message.session_id)) {
          messagesBySession.set(message.session_id, []);
        }
        messagesBySession.get(message.session_id)!.push(message);
      }
    }

    const submissionsBySession = new Map<string, typeof allSubmissions>();
    const submissionsBySessionQuestion = new Map<string, Map<number, Record<string, unknown>>>();
    if (allSubmissions) {
      for (const submission of allSubmissions) {
        if (!submissionsBySession.has(submission.session_id)) {
          submissionsBySession.set(submission.session_id, []);
        }
        submissionsBySession.get(submission.session_id)!.push(submission);
        if (!submissionsBySessionQuestion.has(submission.session_id)) {
          submissionsBySessionQuestion.set(submission.session_id, new Map());
        }
        const byQuestion = submissionsBySessionQuestion.get(submission.session_id)!;
        const existing = byQuestion.get(submission.q_idx);
        byQuestion.set(
          submission.q_idx,
          existing
            ? selectBestSubmission([existing, submission])
            : (submission as Record<string, unknown>)
        );
      }
    }

    // 4. Process each session with pre-fetched data
    const studentData = filteredSessions.map((session) => {
      const sessionId = session.id;

      // Get pre-fetched data
      const grades = gradesBySession.get(sessionId) || [];
      const messages = messagesBySession.get(sessionId) || [];
      const submissions = submissionsBySession.get(sessionId) || [];

      const dedupedGrades = deduplicateGrades(
        grades as Array<{ q_idx: number; score: number; grade_type?: string }>
      ).filter(isScoringGrade);
      const gradeByQ = new Map(dedupedGrades.map((grade) => [grade.q_idx, grade]));
      const submissionsByQuestion =
        submissionsBySessionQuestion.get(sessionId) ?? new Map();
      const scoreItems: ScoreItem[] = normalizedQuestions.map((question) => {
        if (isObjectiveQuestion(question.type)) {
          const submission = submissionsByQuestion.get(question.idx);
          const objective = gradeObjectiveAnswer({
            rawAnswer: (submission?.answer as string) ?? "",
            options: question.options,
            correctOptionIndex: question.correctOptionIndex,
          });
          return { qIdx: question.idx, type: question.type, score: objective?.score };
        }
        return {
          qIdx: question.idx,
          type: question.type,
          score: gradeByQ.get(question.idx)?.score,
        };
      });
      const scoreResult = calculateScoreFromItems(
        scoreItems,
        scoreWeights
      );
      const scoreForDisplay =
        scoreResult.overallScore !== null &&
        (scoreResult.mode === "weighted" || scoreResult.gradedCount > 0)
          ? scoreResult.overallScore
          : null;

      const questionCount = messages.length;

      // 답안 길이 계산 (압축 해제 최소화 - answer 필드 우선 사용)
      let totalAnswerLength = 0;
      for (const submission of submissions) {
        let answer = submission.answer || "";
        // Only decompress if answer is empty and compressed data exists
        if (!answer && submission.compressed_answer_data) {
          try {
            const decompressed = decompressData(
              submission.compressed_answer_data as string
            );
            answer = (decompressed as { answer?: string })?.answer || answer;
          } catch {
            // 압축 해제 실패 시 원본 사용
          }
        }
        totalAnswerLength += answer.length;
      }

      const averageAnswerLength =
        submissions.length > 0
          ? Math.round(totalAnswerLength / submissions.length)
          : 0;

      // 시험 소요 시간 계산 (분 단위)
      const examDuration =
        session.submitted_at && session.created_at
          ? Math.round(
              (new Date(session.submitted_at).getTime() -
                new Date(session.created_at).getTime()) /
                60000
            )
          : null;

      // 단계별 점수 추출
      const stageScores = {
        chat: null as number | null,
        answer: null as number | null,
        feedback: null as number | null,
      };

      if (grades.length > 0) {
        const stageScoresList = {
          chat: [] as number[],
          answer: [] as number[],
          feedback: [] as number[],
        };

        grades.forEach((grade) => {
          if (grade.stage_grading && typeof grade.stage_grading === "object") {
            const stageGrading = grade.stage_grading as {
              chat?: { score: number };
              answer?: { score: number };
              feedback?: { score: number };
            };
            if (stageGrading.chat?.score != null)
              stageScoresList.chat.push(stageGrading.chat.score);
            if (stageGrading.answer?.score != null)
              stageScoresList.answer.push(stageGrading.answer.score);
            // essay 타입 시험에는 피드백 단계가 없음
            if (!isEssayTypeOnly && stageGrading.feedback?.score != null)
              stageScoresList.feedback.push(stageGrading.feedback.score);
          }
        });

        stageScores.chat =
          stageScoresList.chat.length > 0
            ? Math.round(
                stageScoresList.chat.reduce((a, b) => a + b, 0) /
                  stageScoresList.chat.length
              )
            : null;
        stageScores.answer =
          stageScoresList.answer.length > 0
            ? Math.round(
                stageScoresList.answer.reduce((a, b) => a + b, 0) /
                  stageScoresList.answer.length
              )
            : null;
        // essay 타입 시험에는 피드백 단계가 없음
        if (!isEssayTypeOnly) {
          stageScores.feedback =
            stageScoresList.feedback.length > 0
              ? Math.round(
                  stageScoresList.feedback.reduce((a, b) => a + b, 0) /
                    stageScoresList.feedback.length
                )
              : null;
        }
      }

      // 루브릭 항목별 점수 추출
      const rubricScoresMap = new Map<string, number[]>();
      if (grades.length > 0) {
        grades.forEach((grade) => {
          if (grade.stage_grading && typeof grade.stage_grading === "object") {
            const stageGrading = grade.stage_grading as {
              chat?: { rubric_scores?: Record<string, number> };
              answer?: { rubric_scores?: Record<string, number> };
              feedback?: { rubric_scores?: Record<string, number> };
            };

            // 각 단계의 rubric_scores를 합산
            // essay 타입 시험에는 피드백 단계가 없음
            const stages = isEssayTypeOnly
              ? [stageGrading.chat, stageGrading.answer]
              : [stageGrading.chat, stageGrading.answer, stageGrading.feedback];
            stages.filter(Boolean).forEach((stage) => {
              if (stage?.rubric_scores) {
                Object.entries(stage.rubric_scores).forEach(([key, value]) => {
                  if (!rubricScoresMap.has(key)) {
                    rubricScoresMap.set(key, []);
                  }
                  rubricScoresMap.get(key)?.push(value);
                });
              }
            });
          }
        });
      }

      const rubricScores: Record<string, number> = {};
      rubricScoresMap.forEach((scores, key) => {
        const avg =
          scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : 0;
        rubricScores[key] = Math.round(avg * 10) / 10; // 소수점 1자리
      });

      // 질문 유형별 카운트
      const questionTypeCount = {
        concept: 0,
        calculation: 0,
        strategy: 0,
        other: 0,
      };

      messages.forEach((msg) => {
        const type = msg.message_type || "other";
        if (type === "concept") questionTypeCount.concept++;
        else if (type === "calculation") questionTypeCount.calculation++;
        else if (type === "strategy") questionTypeCount.strategy++;
        else questionTypeCount.other++;
      });

      // 학생 프로필 정보 가져오기
      const studentProfile = studentProfileMap.get(session.student_id);

      return {
        sessionId,
        studentId: session.student_id,
        name:
          studentProfile?.name || `Student ${session.student_id.slice(0, 8)}`,
        studentNumber: studentProfile?.student_number || null,
        school: studentProfile?.school || null,
        score: scoreForDisplay,
        questionCount,
        answerLength: averageAnswerLength,
        submittedAt: session.submitted_at,
        createdAt: session.created_at,
        examDuration: examDuration as number | null,
        stageScores,
        rubricScores,
        questionTypeCount,
      };
    });

    // 4. 통계 계산
    const submittedStudents = studentData.filter((s) => s.submittedAt);
    const studentsWithScores = studentData.filter((s) => s.score !== null);

    const averageScore =
      studentsWithScores.length > 0
        ? Math.round(
            studentsWithScores.reduce((sum, s) => sum + (s.score || 0), 0) /
              studentsWithScores.length
          )
        : 0;

    const averageQuestions =
      studentData.length > 0
        ? Math.round(
            studentData.reduce((sum, s) => sum + s.questionCount, 0) /
              studentData.length
          )
        : 0;

    const averageAnswerLength =
      studentData.length > 0
        ? Math.round(
            studentData.reduce((sum, s) => sum + s.answerLength, 0) /
              studentData.length
          )
        : 0;

    // 표준편차 계산 함수
    const calculateStandardDeviation = (values: number[]): number => {
      if (values.length === 0) return 0;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        values.length;
      return Math.sqrt(variance);
    };

    // 각 메트릭의 표준편차 계산
    const scoreValues = studentsWithScores
      .map((s) => s.score)
      .filter((s): s is number => s !== null);
    const standardDeviationScore =
      scoreValues.length > 0
        ? Math.round(calculateStandardDeviation(scoreValues))
        : 0;

    const questionCountValues = studentData.map((s) => s.questionCount);
    const standardDeviationQuestions = Math.round(
      calculateStandardDeviation(questionCountValues)
    );

    const answerLengthValues = studentData.map((s) => s.answerLength);
    const standardDeviationAnswerLength = Math.round(
      calculateStandardDeviation(answerLengthValues)
    );

    const examDurationValues = studentData
      .map((s) => s.examDuration)
      .filter((d): d is number => d !== null);
    const standardDeviationExamDuration =
      examDurationValues.length > 0
        ? Math.round(calculateStandardDeviation(examDurationValues))
        : 0;

    // 점수 분포 (0-20, 21-40, 41-60, 61-80, 81-100)
    const scoreDistribution = [
      { range: "0-20", count: 0 },
      { range: "21-40", count: 0 },
      { range: "41-60", count: 0 },
      { range: "61-80", count: 0 },
      { range: "81-100", count: 0 },
    ];

    studentsWithScores.forEach((s) => {
      const score = s.score || 0;
      if (score <= 20) scoreDistribution[0].count++;
      else if (score <= 40) scoreDistribution[1].count++;
      else if (score <= 60) scoreDistribution[2].count++;
      else if (score <= 80) scoreDistribution[3].count++;
      else scoreDistribution[4].count++;
    });

    // 질문 수 분포
    const questionCountDistribution = [
      { range: "0개", count: 0 },
      { range: "1-3개", count: 0 },
      { range: "4-6개", count: 0 },
      { range: "7-10개", count: 0 },
      { range: "10개 이상", count: 0 },
    ];

    studentData.forEach((s) => {
      const count = s.questionCount;
      if (count === 0) questionCountDistribution[0].count++;
      else if (count <= 3) questionCountDistribution[1].count++;
      else if (count <= 6) questionCountDistribution[2].count++;
      else if (count <= 10) questionCountDistribution[3].count++;
      else questionCountDistribution[4].count++;
    });

    // 답안 길이 분포 (0-100, 101-300, 301-500, 501-1000, 1000+)
    const answerLengthDistribution = [
      { range: "0-100자", count: 0 },
      { range: "101-300자", count: 0 },
      { range: "301-500자", count: 0 },
      { range: "501-1000자", count: 0 },
      { range: "1000자 이상", count: 0 },
    ];

    studentData.forEach((s) => {
      const length = s.answerLength;
      if (length <= 100) answerLengthDistribution[0].count++;
      else if (length <= 300) answerLengthDistribution[1].count++;
      else if (length <= 500) answerLengthDistribution[2].count++;
      else if (length <= 1000) answerLengthDistribution[3].count++;
      else answerLengthDistribution[4].count++;
    });

    // 학생 목록을 점수 기준으로 정렬 (높은 점수부터)
    const sortedStudents = [...studentData].sort((a, b) => {
      // 점수가 있는 학생을 먼저
      if (a.score !== null && b.score === null) return -1;
      if (a.score === null && b.score !== null) return 1;
      // 둘 다 점수가 있으면 점수 높은 순
      if (a.score !== null && b.score !== null) {
        return b.score - a.score;
      }
      // 둘 다 점수가 없으면 제출한 학생을 먼저
      if (a.submittedAt && !b.submittedAt) return -1;
      if (!a.submittedAt && b.submittedAt) return 1;
      return 0;
    });

    // 5. 단계별 성과 분석
    const stageScoresData = {
      chat: [] as number[],
      answer: [] as number[],
      feedback: [] as number[],
    };

    studentData.forEach((s) => {
      if (s.stageScores.chat !== null)
        stageScoresData.chat.push(s.stageScores.chat);
      if (s.stageScores.answer !== null)
        stageScoresData.answer.push(s.stageScores.answer);
      // essay 타입 시험에는 피드백 단계가 없음
      if (!isEssayTypeOnly && s.stageScores.feedback !== null)
        stageScoresData.feedback.push(s.stageScores.feedback);
    });

    const averageStageScores = {
      chat:
        stageScoresData.chat.length > 0
          ? Math.round(
              stageScoresData.chat.reduce((a, b) => a + b, 0) /
                stageScoresData.chat.length
            )
          : 0,
      answer:
        stageScoresData.answer.length > 0
          ? Math.round(
              stageScoresData.answer.reduce((a, b) => a + b, 0) /
                stageScoresData.answer.length
            )
          : 0,
      feedback: isEssayTypeOnly
        ? 0
        : stageScoresData.feedback.length > 0
        ? Math.round(
            stageScoresData.feedback.reduce((a, b) => a + b, 0) /
              stageScoresData.feedback.length
          )
        : 0,
    };

    // 6. 루브릭 항목별 평균 점수 계산
    const rubricItems =
      exam.rubric && Array.isArray(exam.rubric)
        ? (exam.rubric as Array<{ evaluationArea: string }>)
        : [];

    const rubricAverageScores: Record<string, number> = {};
    const rubricScoresByItem = new Map<string, number[]>();

    studentData.forEach((s) => {
      Object.entries(s.rubricScores || {}).forEach(([key, value]) => {
        if (!rubricScoresByItem.has(key)) {
          rubricScoresByItem.set(key, []);
        }
        rubricScoresByItem.get(key)?.push(value);
      });
    });

    rubricScoresByItem.forEach((scores, key) => {
      const avg =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;
      rubricAverageScores[key] = Math.round(avg * 10) / 10;
    });

    // 루브릭 항목별 데이터 (레이더 차트용)
    const rubricRadarData =
      rubricItems.length > 0
        ? rubricItems.map((item) => ({
            area: item.evaluationArea,
            score: rubricAverageScores[item.evaluationArea] || 0,
            fullMark: 5,
          }))
        : [];

    // 7. 질문 유형별 분포
    const questionTypeDistribution = {
      concept: studentData.reduce(
        (sum, s) => sum + (s.questionTypeCount?.concept || 0),
        0
      ),
      calculation: studentData.reduce(
        (sum, s) => sum + (s.questionTypeCount?.calculation || 0),
        0
      ),
      strategy: studentData.reduce(
        (sum, s) => sum + (s.questionTypeCount?.strategy || 0),
        0
      ),
      other: studentData.reduce(
        (sum, s) => sum + (s.questionTypeCount?.other || 0),
        0
      ),
    };

    const questionTypePieData = [
      {
        name: "개념 질문",
        value: questionTypeDistribution.concept,
        fill: "#0F74FF",
      },
      {
        name: "계산 질문",
        value: questionTypeDistribution.calculation,
        fill: "#3B9EFF",
      },
      {
        name: "전략 질문",
        value: questionTypeDistribution.strategy,
        fill: "#6BC5FF",
      },
      {
        name: "기타",
        value: questionTypeDistribution.other,
        fill: "#9DD5FF",
      },
    ].filter((item) => item.value > 0);

    // 8. 시험 소요 시간 분석
    const examDurations = studentData
      .map((s) => s.examDuration)
      .filter((d): d is number => d !== null);

    const averageExamDuration =
      examDurations.length > 0
        ? Math.round(
            examDurations.reduce((a, b) => a + b, 0) / examDurations.length
          )
        : 0;

    // 시험 소요 시간 분포 (0-20분, 21-40분, 41-60분, 61-80분, 80분 이상)
    const examDurationDistribution = [
      { range: "0-20분", count: 0 },
      { range: "21-40분", count: 0 },
      { range: "41-60분", count: 0 },
      { range: "61-80분", count: 0 },
      { range: "80분 이상", count: 0 },
    ];

    examDurations.forEach((duration) => {
      if (duration <= 20) examDurationDistribution[0].count++;
      else if (duration <= 40) examDurationDistribution[1].count++;
      else if (duration <= 60) examDurationDistribution[2].count++;
      else if (duration <= 80) examDurationDistribution[3].count++;
      else examDurationDistribution[4].count++;
    });

    // 단계별 점수 데이터 (Line 차트용)
    // essay 타입 시험에는 피드백 단계가 없음
    const stageComparisonData = isEssayTypeOnly
      ? [
          {
            stage: "Clarification",
            score: averageStageScores.chat,
          },
          {
            stage: "답안 작성",
            score: averageStageScores.answer,
          },
        ]
      : [
          {
            stage: "Clarification",
            score: averageStageScores.chat,
          },
          {
            stage: "답안 작성",
            score: averageStageScores.answer,
          },
          {
            stage: "Reflection",
            score: averageStageScores.feedback,
          },
        ];

    return successJson(
      {
        examId,
        examTitle: exam.title,
        totalStudents: studentData.length,
        submittedStudents: submittedStudents.length,
        averageScore,
        averageQuestions,
        averageAnswerLength,
        averageExamDuration,
        standardDeviationScore,
        standardDeviationQuestions,
        standardDeviationAnswerLength,
        standardDeviationExamDuration,
        students: sortedStudents,
        statistics: {
          scoreDistribution,
          questionCountDistribution,
          answerLengthDistribution,
          examDurationDistribution,
        },
        // 새로운 분석 데이터
        stageAnalysis: {
          averageScores: averageStageScores,
          comparisonData: stageComparisonData,
          hasFeedback: !isEssayTypeOnly,
        },
        rubricAnalysis: {
          averageScores: rubricAverageScores,
          radarData: rubricRadarData,
        },
        questionTypeAnalysis: {
          distribution: questionTypeDistribution,
          pieData: questionTypePieData,
        },
      },
      {
        headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
      }
    );
  } catch {
    return errorJson("INTERNAL_SERVER_ERROR", "Internal server error", 500);
  }
}
