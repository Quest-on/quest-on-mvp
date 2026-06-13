import type { SupabaseClient } from "@supabase/supabase-js";
import { batchGetUserInfo } from "@/lib/app-users";
import { fetchAllPaged } from "@/lib/supabase-paged";
import {
  calculateScoreFromItems,
  deduplicateGrades,
  isScoringGrade,
  normalizeScoreWeights,
  type ScoreWeights,
} from "@/lib/grade-utils";
import {
  gradeObjectiveAnswer,
  isObjectiveQuestion,
  selectBestSubmission,
} from "@/lib/grading-helpers";

/**
 * 시험 결과 내보내기(Excel / CSV) 공용 데이터 로더.
 * 세션·채점·제출·프로필을 한 번 읽어 학생별 점수 행을 계산한다.
 * 포맷(엑셀 시트/CSV 직렬화)은 각 라우트가 담당한다.
 */

export type ExportQuestion = {
  idx?: number;
  text?: string;
  prompt?: string;
  type?: string;
  options?: string[];
  correctOptionIndex?: number;
};

/** qIdx = question.idx ?? 배열 위치(grades/점수 매칭용). pos = 원래 배열 위치(submissions 매칭용). */
export type OrderedQuestion = ExportQuestion & { qIdx: number; pos: number };

type GradeRow = {
  session_id: string;
  q_idx: number;
  score: number;
  grade_type?: string;
};

type SubmissionRow = {
  id: string;
  session_id: string;
  q_idx: number;
  answer: string | null;
  created_at: string | null;
};

export type ExamResultStudent = {
  name: string;
  studentNumber: string;
  hasSubmitted: boolean;
  submittedAt: string | null;
  /** close_at 기준 지각 여부. close_at 없으면 null(판정 불가). */
  isLate: boolean | null;
  /** 문항별 raw 점수(객관식 100/0, 서술형 0-100). 미응답/미채점은 undefined. */
  scores: Array<number | undefined>;
  /** 문항별 응답 존재 여부(미응답 vs 오답 구분용). */
  answered: boolean[];
  /** 객관식 문항에서 학생이 고른 보기 인덱스(0-base). 미응답/비객관식은 null. */
  selectedOptions: Array<number | null>;
  finalScore: number | null;
};

export type ExamResultData = {
  orderedQuestions: OrderedQuestion[];
  scoreWeights: ScoreWeights | null;
  students: ExamResultStudent[];
  finalScores: number[];
  gradedCount: number;
  /** 문항별 집계 라벨: 객관식 "정답률 N%", 서술형 "평균 N점". */
  questionStats: string[];
};

export function averageInt(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * 한 학생의 문항별 결과(응답 여부·선택지·점수)를 계산한다.
 * - 객관식 답안/선택/재채점: submissions는 배열 위치(pos)로 저장되므로 **pos**로 조회한다.
 * - 서술형 점수: grades는 `idx ?? pos`로 저장되므로 **qIdx(=idx ?? pos)**로 조회한다.
 * (대시보드 student-summaries와 동일 규약. idx≠위치(결번) 시험에서 답안 누락을 방지.)
 */
export function computeStudentQuestionResults<S extends { answer?: string | null }>(
  orderedQuestions: OrderedQuestion[],
  submissionsByPos: Map<number, S>,
  scoreByQuestion: Map<number, number>,
  hasSubmitted: boolean
): {
  answered: boolean[];
  selectedOptions: Array<number | null>;
  scores: Array<number | undefined>;
} {
  const answered = orderedQuestions.map((q) => {
    const sub = submissionsByPos.get(q.pos);
    return (sub?.answer ?? "").trim().length > 0;
  });

  const selectedOptions = orderedQuestions.map((q) => {
    if (!isObjectiveQuestion(q.type)) return null;
    const sub = submissionsByPos.get(q.pos);
    const raw = (sub?.answer ?? "").trim();
    if (raw === "") return null;
    const idx = Number.parseInt(raw, 10);
    return Number.isInteger(idx) && idx >= 0 ? idx : null;
  });

  const scores: Array<number | undefined> = hasSubmitted
    ? orderedQuestions.map((question) => {
        if (isObjectiveQuestion(question.type)) {
          // 객관식은 raw 제출을 결정론적으로 재채점한다(stale grade row보다 우선).
          const submission = submissionsByPos.get(question.pos);
          const objective = gradeObjectiveAnswer({
            rawAnswer: submission?.answer ?? "",
            options: question.options,
            correctOptionIndex: question.correctOptionIndex,
          });
          return objective ? objective.score : undefined;
        }
        return scoreByQuestion.get(question.qIdx);
      })
    : orderedQuestions.map(() => undefined);

  return { answered, selectedOptions, scores };
}

export type ExamRowForExport = {
  questions: unknown;
  score_weights: unknown;
  close_at: string | null;
};

export async function loadExamResultData(
  supabase: SupabaseClient,
  examId: string,
  exam: ExamRowForExport
): Promise<
  | { ok: false; error: string }
  | { ok: true; data: ExamResultData }
> {
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, student_id, submitted_at, created_at")
    .eq("exam_id", examId)
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (sessionsError) {
    return { ok: false, error: "Failed to fetch sessions" };
  }

  const questions = Array.isArray(exam.questions)
    ? (exam.questions as ExportQuestion[])
    : [];
  const orderedQuestions: OrderedQuestion[] = questions
    .map((question, index) => ({
      ...question,
      qIdx: typeof question.idx === "number" ? question.idx : index,
      pos: index,
    }))
    .sort((a, b) => a.qIdx - b.qIdx);
  const scoreWeights = normalizeScoreWeights(exam.score_weights);
  const closeAt = exam.close_at ? new Date(exam.close_at).getTime() : null;

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const studentIds = [...new Set((sessions ?? []).map((s) => s.student_id))];

  // 1000행(PostgREST max-rows) 절단 방지: .in(전체 세션) 조회를 페이지네이션으로 전량 수집
  const [profilesResult, gradesResult, submissionsResult, clerkUserMap] =
    await Promise.all([
      studentIds.length > 0
        ? fetchAllPaged((from, to) =>
            supabase
              .from("student_profiles")
              .select("student_id, name, student_number")
              .in("student_id", studentIds)
              .range(from, to)
          )
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length > 0
        ? fetchAllPaged((from, to) =>
            supabase
              .from("grades")
              .select("session_id, q_idx, score, grade_type")
              .in("session_id", sessionIds)
              .range(from, to)
          )
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length > 0
        ? fetchAllPaged((from, to) =>
            supabase
              .from("submissions")
              .select("id, session_id, q_idx, answer, created_at")
              .in("session_id", sessionIds)
              .range(from, to)
          )
        : Promise.resolve({ data: [], error: null }),
      batchGetUserInfo(studentIds),
    ]);

  if (profilesResult.error) {
    return { ok: false, error: "Failed to fetch student profiles" };
  }
  if (gradesResult.error) {
    return { ok: false, error: "Failed to fetch grades" };
  }
  if (submissionsResult.error) {
    return { ok: false, error: "Failed to fetch submissions" };
  }

  const profileByStudentId = new Map(
    (profilesResult.data ?? []).map((p) => [p.student_id, p])
  );

  const gradesBySessionId = new Map<string, GradeRow[]>();
  (gradesResult.data ?? []).forEach((grade) => {
    if (!gradesBySessionId.has(grade.session_id)) {
      gradesBySessionId.set(grade.session_id, []);
    }
    gradesBySessionId.get(grade.session_id)?.push(grade as GradeRow);
  });

  const submissionsBySessionQuestion = new Map<
    string,
    Map<number, SubmissionRow>
  >();
  (submissionsResult.data ?? []).forEach((submission) => {
    const row = submission as SubmissionRow;
    if (!submissionsBySessionQuestion.has(row.session_id)) {
      submissionsBySessionQuestion.set(row.session_id, new Map());
    }
    const byQuestion = submissionsBySessionQuestion.get(row.session_id)!;
    const existing = byQuestion.get(row.q_idx);
    byQuestion.set(
      row.q_idx,
      existing ? (selectBestSubmission([existing, row]) as SubmissionRow) : row
    );
  });

  const sortedSessions = [...(sessions ?? [])].sort((a, b) => {
    const aName =
      profileByStudentId.get(a.student_id)?.name ||
      clerkUserMap.get(a.student_id)?.name ||
      "";
    const bName =
      profileByStudentId.get(b.student_id)?.name ||
      clerkUserMap.get(b.student_id)?.name ||
      "";
    return (
      aName.localeCompare(bName, "ko") ||
      a.student_id.localeCompare(b.student_id)
    );
  });

  const students: ExamResultStudent[] = sortedSessions.map((session) => {
    const profile = profileByStudentId.get(session.student_id);
    const clerkInfo = clerkUserMap.get(session.student_id);
    const name =
      profile?.name ||
      clerkInfo?.name ||
      `Student ${session.student_id.slice(0, 8)}`;
    const hasSubmitted = session.submitted_at != null;

    const dedupedGrades = deduplicateGrades(
      gradesBySessionId.get(session.id) ?? []
    ).filter(isScoringGrade);
    const scoreByQuestion = new Map(
      dedupedGrades.map((grade) => [grade.q_idx, grade.score])
    );
    const submissionsByQuestion: Map<number, SubmissionRow> =
      submissionsBySessionQuestion.get(session.id) ?? new Map();

    const { answered, selectedOptions, scores } = computeStudentQuestionResults(
      orderedQuestions,
      submissionsByQuestion,
      scoreByQuestion,
      hasSubmitted
    );

    const scoreItems = orderedQuestions.map((question, index) => ({
      qIdx: question.qIdx,
      type: question.type,
      score: scores[index],
    }));
    const scoreResult = calculateScoreFromItems(scoreItems, scoreWeights);
    const finalScore =
      hasSubmitted &&
      scoreResult.overallScore !== null &&
      (scoreResult.mode === "weighted" || scoreResult.gradedCount > 0)
        ? scoreResult.overallScore
        : null;

    const isLate =
      hasSubmitted && closeAt != null && session.submitted_at != null
        ? new Date(session.submitted_at).getTime() > closeAt
        : null;

    return {
      name,
      studentNumber: profile?.student_number ?? "",
      hasSubmitted,
      submittedAt: session.submitted_at,
      isLate,
      scores,
      answered,
      selectedOptions,
      finalScore,
    };
  });

  const finalScores = students
    .map((s) => s.finalScore)
    .filter((score): score is number => typeof score === "number");

  const questionStats = orderedQuestions.map((question, qi) => {
    if (isObjectiveQuestion(question.type)) {
      let answered = 0;
      let correct = 0;
      students.forEach((s) => {
        if (!s.hasSubmitted) return;
        const score = s.scores[qi];
        if (typeof score === "number") {
          answered += 1;
          if (score >= 100) correct += 1;
        }
      });
      return answered
        ? `정답률 ${Math.round((correct / answered) * 100)}%`
        : "-";
    }
    const vals = students
      .map((s) => s.scores[qi])
      .filter((score): score is number => typeof score === "number");
    return vals.length ? `평균 ${averageInt(vals)}점` : "-";
  });

  return {
    ok: true,
    data: {
      orderedQuestions,
      scoreWeights,
      students,
      finalScores,
      gradedCount: finalScores.length,
      questionStats,
    },
  };
}

export function formatExportSubmittedAt(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** 한 문항 셀 표시값: 객관식 "N번(정답/오답)", 서술형 점수/미채점, 미응답 빈칸. */
export function formatQuestionCell(
  student: ExamResultStudent,
  question: OrderedQuestion,
  index: number
): string | number {
  if (!student.hasSubmitted) return "";
  if (isObjectiveQuestion(question.type)) {
    const selected = student.selectedOptions[index];
    if (selected == null) return ""; // 미응답
    const score = student.scores[index];
    const verdict =
      typeof score === "number" ? (score >= 100 ? "정답" : "오답") : "?";
    const choice =
      question.type === "true-false"
        ? selected === 0
          ? "O"
          : selected === 1
            ? "X"
            : `${selected + 1}번`
        : `${selected + 1}번`;
    return `${choice}(${verdict})`;
  }
  const score = student.scores[index];
  if (typeof score === "number") return score;
  return student.answered[index] ? "미채점" : "";
}

/** 엑셀 '점수' 시트와 CSV가 공유하는 헤더. */
export function examScoreHeader(orderedQuestions: OrderedQuestion[]): string[] {
  return [
    "이름",
    "학번",
    "제출 시각",
    "지각",
    ...orderedQuestions.map((_, i) => `${i + 1}번`),
    "최종 점수",
  ];
}

/** 엑셀 '점수' 시트와 CSV가 공유하는 한 학생 행. */
export function examScoreRow(
  student: ExamResultStudent,
  orderedQuestions: OrderedQuestion[]
): Array<string | number> {
  return [
    student.name,
    student.studentNumber,
    student.hasSubmitted
      ? formatExportSubmittedAt(student.submittedAt)
      : "미응시",
    !student.hasSubmitted
      ? "-"
      : student.isLate == null
        ? "-"
        : student.isLate
          ? "지각"
          : "정상",
    ...orderedQuestions.map((q, i) => formatQuestionCell(student, q, i)),
    student.hasSubmitted ? (student.finalScore ?? "미채점") : "미응시",
  ];
}
