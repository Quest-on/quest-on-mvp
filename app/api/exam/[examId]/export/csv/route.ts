import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { errorJson } from "@/lib/api-response";
import {
  loadExamResultData,
  examScoreHeader,
  examScoreRow,
} from "@/lib/exam-export";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateUUID } from "@/lib/validate-params";

/** CSV 필드 escape: 쉼표/따옴표/개행 포함 시 따옴표로 감싸고 내부 따옴표는 이중화. */
function csvField(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildFileName(title: string) {
  const normalized = title.replace(/[\\/:*?"<>|]/g, " ").trim() || "시험";
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  return `${normalized}_${date}.csv`;
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
      `exam-export-csv:${user.id}`,
      RATE_LIMITS.sessionRead
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const supabase = getSupabaseServer();
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select(
        "id, title, code, instructor_id, questions, status, score_weights, close_at"
      )
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

    const result = await loadExamResultData(supabase, examId, exam);
    if (!result.ok) {
      return errorJson("INTERNAL_ERROR", result.error, 500);
    }

    // 엑셀 '점수' 시트와 동일한 컬럼 구성으로 통일
    const { students, orderedQuestions } = result.data;
    const lines = [examScoreHeader(orderedQuestions).map(csvField).join(",")];
    students.forEach((student) => {
      lines.push(examScoreRow(student, orderedQuestions).map(csvField).join(","));
    });

    // UTF-8 BOM: 한글 Excel에서 인코딩 깨짐 방지
    const csv = "﻿" + lines.join("\r\n");
    const fileName = buildFileName(exam.title);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="exam-results.csv"; filename*=UTF-8''${encodeURIComponent(
          fileName
        )}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logError("CSV export handler error", error, {
      path: "/api/exam/[examId]/export/csv",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
