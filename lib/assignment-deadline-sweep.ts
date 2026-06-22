import { getSupabaseServer } from "@/lib/supabase-server";
import { isAssignmentType } from "@/lib/grading-helpers";
import {
  autoSubmitAssignmentAtDeadline,
  DEADLINE_AUTO_SUBMIT_STATUSES,
} from "@/lib/assignment-quiz";
import { logError } from "@/lib/logger";

const ASSIGNMENT_TYPES = ["report", "code", "erd", "mindmap", "assignment"];

export async function autoSubmitEligibleSessionsForExam(examId: string): Promise<{
  submitted: number;
  skipped: number;
  failed: string[];
}> {
  const supabase = getSupabaseServer();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, type, deadline")
    .eq("id", examId)
    .single();

  if (examError || !exam || !isAssignmentType(exam.type) || !exam.deadline) {
    return { submitted: 0, skipped: 0, failed: [] };
  }

  if (new Date(exam.deadline as string).getTime() >= Date.now()) {
    return { submitted: 0, skipped: 0, failed: [] };
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id")
    .eq("exam_id", examId)
    .in("status", [...DEADLINE_AUTO_SUBMIT_STATUSES])
    .is("submitted_at", null);

  if (sessionsError) {
    logError("[assignment-deadline-sweep] Failed to list eligible sessions", sessionsError, {
      path: "lib/assignment-deadline-sweep.ts",
      additionalData: { examId },
    });
    return { submitted: 0, skipped: 0, failed: [] };
  }

  if (!sessions?.length) {
    return { submitted: 0, skipped: 0, failed: [] };
  }

  let submitted = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const { id } of sessions) {
    const result = await autoSubmitAssignmentAtDeadline(id);
    if (result.ok) {
      if (result.alreadySubmitted) skipped++;
      else submitted++;
    } else {
      failed.push(id);
      logError("[assignment-deadline-sweep] Session auto-submit failed", new Error(result.error), {
        path: "lib/assignment-deadline-sweep.ts",
        additionalData: { sessionId: id, examId },
      });
    }
  }

  return { submitted, skipped, failed };
}

export async function sweepAllPastDeadlineAssignments(options?: {
  maxExams?: number;
}): Promise<{
  examsProcessed: number;
  sessionsSubmitted: number;
  sessionsSkipped: number;
  failedSessionIds: string[];
}> {
  const maxExams = options?.maxExams ?? 20;
  const supabase = getSupabaseServer();
  const now = new Date().toISOString();

  const { data: exams, error } = await supabase
    .from("exams")
    .select("id")
    .in("type", ASSIGNMENT_TYPES)
    .not("deadline", "is", null)
    .lt("deadline", now)
    .limit(maxExams);

  if (error) {
    logError("[assignment-deadline-sweep] Failed to list past-deadline assignments", error, {
      path: "lib/assignment-deadline-sweep.ts",
    });
    return {
      examsProcessed: 0,
      sessionsSubmitted: 0,
      sessionsSkipped: 0,
      failedSessionIds: [],
    };
  }

  let sessionsSubmitted = 0;
  let sessionsSkipped = 0;
  const failedSessionIds: string[] = [];

  for (const exam of exams ?? []) {
    const result = await autoSubmitEligibleSessionsForExam(exam.id);
    sessionsSubmitted += result.submitted;
    sessionsSkipped += result.skipped;
    failedSessionIds.push(...result.failed);
  }

  return {
    examsProcessed: exams?.length ?? 0,
    sessionsSubmitted,
    sessionsSkipped,
    failedSessionIds,
  };
}
