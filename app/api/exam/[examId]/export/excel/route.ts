import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { errorJson } from "@/lib/api-response";
import { batchGetUserInfo } from "@/lib/app-users";
import {
  calculateScoreFromItems,
  deduplicateGrades,
  isScoringGrade,
  normalizeScoreWeights,
} from "@/lib/grade-utils";
import {
  gradeObjectiveAnswer,
  isObjectiveQuestion,
  selectBestSubmission,
} from "@/lib/grading-helpers";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateUUID } from "@/lib/validate-params";

type Question = {
  idx?: number;
  text?: string;
  prompt?: string;
  type?: string;
  options?: string[];
  correctOptionIndex?: number;
};

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

type StudentExportRow = {
  name: string;
  studentNumber: string;
  scores: Array<number | undefined>;
  finalScore: number | null;
};

function getSupabase() {
  return getSupabaseServer();
}

function sanitizeWorksheetName(name: string) {
  return name.replace(/[*?:/\\[\]]/g, " ").slice(0, 31) || "시험 결과";
}

function buildFileName(title: string) {
  const normalized = title.replace(/[\\/:*?"<>|]/g, " ").trim() || "시험";
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  return `${normalized}_${date}.xlsx`;
}

function stripHtml(value: string | null) {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(
      `exam-export-excel:${user.id}`,
      RATE_LIMITS.sessionRead
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const supabase = getSupabase();
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, code, description, duration, instructor_id, questions, status, score_weights")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    if (exam.status !== "closed") {
      return errorJson(
        "EXAM_NOT_CLOSED",
        "시험 종료 후에 내보낼 수 있습니다.",
        409
      );
    }

    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, student_id, submitted_at, created_at")
      .eq("exam_id", examId)
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (sessionsError) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch sessions", 500);
    }

    const questions = Array.isArray(exam.questions)
      ? (exam.questions as Question[])
      : [];
    const orderedQuestions = questions
      .map((question, index) => ({
        ...question,
        qIdx: typeof question.idx === "number" ? question.idx : index,
      }))
      .sort((a, b) => a.qIdx - b.qIdx);
    const scoreWeights = normalizeScoreWeights(exam.score_weights);

    const sessionIds = (sessions ?? []).map((session) => session.id);
    const studentIds = [
      ...new Set((sessions ?? []).map((session) => session.student_id)),
    ];

    const [profilesResult, gradesResult, submissionsResult, clerkUserMap] = await Promise.all([
      studentIds.length > 0
        ? supabase
            .from("student_profiles")
            .select("student_id, name, student_number")
            .in("student_id", studentIds)
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length > 0
        ? supabase
            .from("grades")
            .select("session_id, q_idx, score, grade_type")
            .in("session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length > 0
        ? supabase
            .from("submissions")
            .select("id, session_id, q_idx, answer, created_at")
            .in("session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      batchGetUserInfo(studentIds),
    ]);

    if (profilesResult.error) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch student profiles", 500);
    }
    if (gradesResult.error) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch grades", 500);
    }
    if (submissionsResult.error) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch submissions", 500);
    }

    const profileByStudentId = new Map(
      (profilesResult.data ?? []).map((profile) => [
        profile.student_id,
        profile,
      ])
    );

    const gradesBySessionId = new Map<string, GradeRow[]>();
    (gradesResult.data ?? []).forEach((grade) => {
      if (!gradesBySessionId.has(grade.session_id)) {
        gradesBySessionId.set(grade.session_id, []);
      }
      gradesBySessionId.get(grade.session_id)?.push(grade as GradeRow);
    });

    const submissionsBySessionQuestion = new Map<string, Map<number, SubmissionRow>>();
    (submissionsResult.data ?? []).forEach((submission) => {
      const row = submission as SubmissionRow;
      if (!submissionsBySessionQuestion.has(row.session_id)) {
        submissionsBySessionQuestion.set(row.session_id, new Map());
      }
      const byQuestion = submissionsBySessionQuestion.get(row.session_id)!;
      const existing = byQuestion.get(row.q_idx);
      byQuestion.set(
        row.q_idx,
        existing
          ? (selectBestSubmission([existing, row]) as SubmissionRow)
          : row
      );
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Quest-On";
    workbook.created = new Date();

    const sortedSessions = [...(sessions ?? [])].sort((a, b) => {
      const aProfile = profileByStudentId.get(a.student_id);
      const bProfile = profileByStudentId.get(b.student_id);
      const aName =
        aProfile?.name || clerkUserMap.get(a.student_id)?.name || "";
      const bName =
        bProfile?.name || clerkUserMap.get(b.student_id)?.name || "";
      return (
        aName.localeCompare(bName, "ko") ||
        a.student_id.localeCompare(b.student_id)
      );
    });

    const studentRows: StudentExportRow[] = sortedSessions.map((session) => {
      const profile = profileByStudentId.get(session.student_id);
      const clerkInfo = clerkUserMap.get(session.student_id);
      const studentName =
        profile?.name ||
        clerkInfo?.name ||
        `Student ${session.student_id.slice(0, 8)}`;
      const dedupedGrades = deduplicateGrades(
        gradesBySessionId.get(session.id) ?? []
      ).filter(isScoringGrade);
      const scoreByQuestion = new Map(
        dedupedGrades.map((grade) => [grade.q_idx, grade.score])
      );
      const submissionsByQuestion =
        submissionsBySessionQuestion.get(session.id) ?? new Map();
      const hasSubmitted = session.submitted_at != null;
      const questionScores = hasSubmitted ? orderedQuestions.map((question) => {
        if (isObjectiveQuestion(question.type)) {
          const submission = submissionsByQuestion.get(question.qIdx);
          const objective = gradeObjectiveAnswer({
            rawAnswer: submission?.answer ?? "",
            options: question.options,
            correctOptionIndex: question.correctOptionIndex,
          });
          return objective ? objective.score : undefined;
        }
        return scoreByQuestion.get(question.qIdx);
      }) : orderedQuestions.map(() => undefined);
      const scoreItems = orderedQuestions.map((question, index) => ({
        qIdx: question.qIdx,
        type: question.type,
        score: questionScores[index],
      }));
      const scoreResult = calculateScoreFromItems(
        scoreItems,
        scoreWeights
      );
      return {
        name: studentName,
        studentNumber: profile?.student_number ?? "",
        scores: questionScores,
        finalScore:
          hasSubmitted &&
          scoreResult.overallScore !== null &&
          (scoreResult.mode === "weighted" || scoreResult.gradedCount > 0)
            ? scoreResult.overallScore
            : null,
      };
    });

    const gradedRows = studentRows.filter((row) =>
      row.finalScore !== null
    );
    const finalScores = gradedRows
      .map((row) => row.finalScore)
      .filter((score): score is number => typeof score === "number");
    const questionAverages = orderedQuestions.map((_, questionIndex) =>
      average(
        studentRows
          .map((row) => row.scores[questionIndex])
          .filter((score): score is number => typeof score === "number")
      )
    );

    const worksheet = workbook.addWorksheet(sanitizeWorksheetName(exam.title));
    const scoreTableColumns = orderedQuestions.length + 3;
    const totalColumns = Math.max(scoreTableColumns, 5);
    worksheet.columns = [
      { key: "name", width: 18 },
      { key: "studentNumber", width: 18 },
      ...orderedQuestions.map((_, index) => ({
        key: `q${index}`,
        width: 14,
      })),
      { key: "finalScore", width: 14 },
    ];
    worksheet.getColumn(4).width = Math.max(
      worksheet.getColumn(4).width ?? 12,
      14
    );
    worksheet.getColumn(5).width = Math.max(
      worksheet.getColumn(5).width ?? 12,
      14
    );

    worksheet.mergeCells(1, 1, 1, totalColumns);
    worksheet.getCell(1, 1).value = `${exam.title} 시험 결과`;
    worksheet.getCell(1, 1).font = { bold: true, size: 16 };
    worksheet.getCell(1, 1).alignment = { horizontal: "center" };
    worksheet.getCell(1, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFF6FF" },
    };

    worksheet.addRow(["시험명", exam.title]);
    worksheet.addRow(["시험 코드", exam.code]);
    worksheet.addRow(["시험 설명", stripHtml(exam.description)]);
    worksheet.addRow(["시험 시간", `${exam.duration}분`]);
    worksheet.addRow(["문항 수", `${orderedQuestions.length}개`]);
    worksheet.addRow(["응시 학생 수", `${sessions?.length ?? 0}명`]);
    worksheet.addRow(["내보낸 날짜", new Date().toLocaleString("ko-KR")]);

    worksheet.getCell(2, 4).value = "요약";
    worksheet.getCell(2, 5).value = "값";
    worksheet.getCell(3, 4).value = "채점 완료";
    worksheet.getCell(3, 5).value = `${gradedRows.length}명`;
    worksheet.getCell(4, 4).value = "평균 최종 점수";
    worksheet.getCell(4, 5).value = average(finalScores);
    worksheet.getCell(5, 4).value = "최고 최종 점수";
    worksheet.getCell(5, 5).value = finalScores.length
      ? Math.max(...finalScores)
      : 0;
    worksheet.getCell(6, 4).value = "최저 최종 점수";
    worksheet.getCell(6, 5).value = finalScores.length
      ? Math.min(...finalScores)
      : 0;

    const ranges = [
      { label: "90점 이상", min: 90, max: Infinity },
      { label: "80-89점", min: 80, max: 89 },
      { label: "70-79점", min: 70, max: 79 },
      { label: "60-69점", min: 60, max: 69 },
      { label: "60점 미만", min: -Infinity, max: 59 },
    ];
    worksheet.addRow([]);
    worksheet.addRow([]);
    // 유형별 카운터로 MCQ1, OX1, Case1 형식 헤더 생성
    const typeCounters: Record<string, number> = {};
    const questionHeaders = orderedQuestions.map((q) => {
      const type = q.type ?? "essay";
      const prefix =
        type === "multiple-choice" ? "MCQ" :
        type === "true-false" ? "OX" :
        "Case";
      typeCounters[prefix] = (typeCounters[prefix] ?? 0) + 1;
      return `${prefix}${typeCounters[prefix]}`;
    });

    const tableHeaderRow = worksheet.addRow([
      "이름",
      "학번",
      ...questionHeaders,
      "최종 점수",
    ]);
    const tableHeaderRowNumber = tableHeaderRow.number;

    for (let rowNumber = 2; rowNumber <= 8; rowNumber++) {
      worksheet.getCell(rowNumber, 1).font = { bold: true };
      worksheet.getCell(rowNumber, 1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F4F6" },
      };
    }

    [2, 4].forEach((columnNumber) => {
      const cell = worksheet.getCell(2, columnNumber);
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDBEAFE" },
      };
    });
    [5].forEach((columnNumber) => {
      const cell = worksheet.getCell(2, columnNumber);
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDBEAFE" },
      };
    });

    const headerRow = worksheet.getRow(tableHeaderRowNumber);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center" };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFF6FF" },
    };

    studentRows.forEach((studentRow) => {
      const excelRow = worksheet.addRow([
        studentRow.name,
        studentRow.studentNumber,
        ...studentRow.scores.map((score) => score ?? ""),
        studentRow.finalScore ?? "",
      ]);
      excelRow.getCell(scoreTableColumns).font = { bold: true };
    });

    const averageRow = worksheet.addRow([
      "문항 평균",
      "",
      ...questionAverages,
      average(finalScores),
    ]);
    averageRow.font = { bold: true };
    averageRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" },
    };

    worksheet.addRow([]);
    const distributionHeaderRow = worksheet.addRow([
      "최종 점수 분포",
      "인원",
      "비율",
    ]);
    distributionHeaderRow.font = { bold: true };
    distributionHeaderRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDBEAFE" },
    };
    ranges.forEach((range) => {
      const count = finalScores.filter(
        (score) => score >= range.min && score <= range.max
      ).length;
      worksheet.addRow([
        range.label,
        count,
        finalScores.length
          ? `${Math.round((count / finalScores.length) * 100)}%`
          : "0%",
      ]);
    });

    worksheet.autoFilter = {
      from: { row: tableHeaderRowNumber, column: 1 },
      to: { row: tableHeaderRowNumber, column: scoreTableColumns },
    };
    worksheet.views = [
      { state: "frozen", ySplit: tableHeaderRowNumber, activeCell: "A13" },
    ];

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = buildFileName(exam.title);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="exam-results.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logError("Excel export handler error", error, {
      path: "/api/exam/[examId]/export/excel",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
