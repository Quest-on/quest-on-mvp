import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  normalizeQuestions,
  decompressSubmissions,
  decompressMessages,
  isCaseQuestion,
} from "@/lib/grading-helpers";
import { batchGetUserInfo } from "@/lib/app-users";
import { logError } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BulkGradingAnswer = {
  qIdx: number;
  questionPrompt: string;
  answer: string;
  chatSummary: string;
};

export type BulkGradingStudentData = {
  studentName: string;
  sessionId: string;
  answers: BulkGradingAnswer[];
  overallSummary?: string;
};

export type ExamCaseData = {
  examTitle: string;
  examDescription: string | null;
  examLanguage: "ko" | "en";
  caseQuestions: Array<{ qIdx: number; questionPrompt: string }>;
  students: BulkGradingStudentData[];
};

export type ParsedGrade = {
  session_id: string;
  q_idx: number;
  score: number;
  comment: string;
};

export type ProposedGrade = { score: number; comment: string };
export type ProposedGradesMap = Record<string, Record<number, ProposedGrade>>;
export type BulkGradingScope = "sample" | "full";

// ─── Constants ────────────────────────────────────────────────────────────────

const ANSWER_MAX_CHARS = 2000;
const CHAT_MAX_CHARS = 2000;
export const CALIBRATION_SAMPLE_SIZE = 3;

// ─── Zod schema for AI response parsing ──────────────────────────────────────

const parsedGradeItemSchema = z.object({
  q_idx: z.number().int().min(0),
  score: z.number(),
  comment: z.string().max(3000).default(""),
});

const gradesResponseSchema = z.union([
  z.object({
    session_id: z.string().uuid(),
    grades: z.array(parsedGradeItemSchema).min(1),
  }),
  z.object({
    grades: z
      .array(parsedGradeItemSchema.extend({ session_id: z.string().uuid() }))
      .min(1),
  }),
]);

// ─── loadExamCaseData ─────────────────────────────────────────────────────────

/**
 * Load all submitted student case-question data for an exam.
 * Parallel-queries submissions, messages, profiles — same pattern as student-summaries.
 */
export async function loadExamCaseData(
  supabase: ReturnType<typeof getSupabaseServer>,
  examId: string,
): Promise<ExamCaseData> {
  // 1. Load exam
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("title, description, questions, language")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    throw new Error("Exam not found");
  }

  const questions = normalizeQuestions(exam.questions);
  const caseQuestions = questions
    .filter((q) => isCaseQuestion(q.type))
    .map((q) => ({
      qIdx: q.idx,
      questionPrompt: q.prompt ?? "",
    }));

  const caseQIdxSet = new Set(caseQuestions.map((q) => q.qIdx));

  // 2. Load submitted sessions
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, student_id")
    .eq("exam_id", examId)
    .not("submitted_at", "is", null);

  if (sessionsError) {
    throw new Error("Failed to load sessions");
  }

  if (!sessions || sessions.length === 0) {
    return {
      examTitle: exam.title as string,
      examDescription: (exam.description as string | null) ?? null,
      examLanguage: (exam.language as string) === "en" ? "en" : "ko",
      caseQuestions,
      students: [],
    };
  }

  const sessionIds = sessions.map((s) => s.id as string);
  const studentIds = [...new Set(sessions.map((s) => s.student_id as string))];

  // 3. Parallel data load
  const [submissionsResult, messagesResult, profilesResult, userInfoMap] =
    await Promise.all([
      supabase
        .from("submissions")
        .select("session_id, q_idx, answer, compressed_answer_data, created_at, id")
        .in("session_id", sessionIds)
        .in("q_idx", [...caseQIdxSet]),
      supabase
        .from("messages")
        .select("session_id, q_idx, role, content, compressed_content, created_at")
        .in("session_id", sessionIds)
        .in("q_idx", [...caseQIdxSet])
        .in("role", ["user", "ai"])
        .order("created_at", { ascending: true }),
      supabase
        .from("student_profiles")
        .select("student_id, name")
        .in("student_id", studentIds),
      batchGetUserInfo(studentIds),
    ]);

  if (submissionsResult.error) {
    logError("loadExamCaseData: submissions query failed", submissionsResult.error, {
      path: "lib/bulk-grading.ts",
    });
    throw new Error("Failed to load submissions");
  }
  if (messagesResult.error) {
    logError("loadExamCaseData: messages query failed", messagesResult.error, {
      path: "lib/bulk-grading.ts",
    });
  }

  // 4. Build lookup maps
  const profileMap = new Map<string, string>();
  for (const p of profilesResult.data ?? []) {
    profileMap.set(p.student_id as string, p.name as string);
  }

  // Group submissions and messages by session
  const submissionsBySession = new Map<string, Array<Record<string, unknown>>>();
  for (const sub of submissionsResult.data ?? []) {
    const sid = sub.session_id as string;
    if (!submissionsBySession.has(sid)) submissionsBySession.set(sid, []);
    submissionsBySession.get(sid)!.push(sub as Record<string, unknown>);
  }

  const messagesBySession = new Map<string, Array<Record<string, unknown>>>();
  for (const msg of messagesResult.data ?? []) {
    const sid = msg.session_id as string;
    if (!messagesBySession.has(sid)) messagesBySession.set(sid, []);
    messagesBySession.get(sid)!.push(msg as Record<string, unknown>);
  }

  // 5. Build per-student data
  const sessionByStudentId = new Map<string, string>();
  for (const s of sessions) {
    sessionByStudentId.set(s.student_id as string, s.id as string);
  }

  const students: BulkGradingStudentData[] = [];

  for (const session of sessions) {
    const sessionId = session.id as string;
    const studentId = session.student_id as string;

    const studentName =
      profileMap.get(studentId) ??
      userInfoMap.get(studentId)?.name ??
      `Student ${studentId.slice(0, 8)}`;

    const sessionSubmissions = submissionsBySession.get(sessionId) ?? [];
    const sessionMessages = messagesBySession.get(sessionId) ?? [];

    const decompressedSubs = decompressSubmissions(sessionSubmissions);
    const decompressedMsgs = decompressMessages(sessionMessages);

    const answers: BulkGradingAnswer[] = [];

    for (const cq of caseQuestions) {
      const sub = decompressedSubs[cq.qIdx];
      const msgs = decompressedMsgs[cq.qIdx] ?? [];

      const answer = sub?.answer
        ? sub.answer.slice(0, ANSWER_MAX_CHARS)
        : "";

      const chatLines = msgs
        .map((m) => {
          const roleLabel = m.role === "user" ? "Student" : m.role === "ai" ? "AI" : m.role;
          return `${roleLabel}: ${m.content}`;
        })
        .join("\n\n");
      const chatSummary = chatLines.slice(0, CHAT_MAX_CHARS);

      answers.push({
        qIdx: cq.qIdx,
        questionPrompt: cq.questionPrompt,
        answer,
        chatSummary,
      });
    }

    if (answers.length > 0) {
      students.push({ studentName, sessionId, answers });
    }
  }

  return {
    examTitle: exam.title as string,
    examDescription: (exam.description as string | null) ?? null,
    examLanguage: (exam.language as string) === "en" ? "en" : "ko",
    caseQuestions,
    students,
  };
}

// ─── parseGradesFromAiResponse ────────────────────────────────────────────────

/**
 * Extract and validate a JSON grades block from AI response text.
 *
 * Validates session_ids against a whitelist to prevent AI hallucination.
 * Returns null on any parse/validation failure.
 */
export function parseGradesFromAiResponse(
  content: string,
  validSessionIds: Set<string>,
  validQIdxes: Set<number>,
): ParsedGrade[] | null {
  // Extract ```json ... ``` block (last occurrence wins if multiple), or accept raw JSON.
  const matches = [...content.matchAll(/```json\s*([\s\S]*?)```/g)];
  const lastMatch = matches[matches.length - 1];
  const jsonStr = (lastMatch?.[1] ?? content).trim();
  if (!jsonStr) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  const result = gradesResponseSchema.safeParse(parsed);
  if (!result.success) return null;

  // Deduplicate by (session_id, q_idx) — last occurrence wins
  const seen = new Map<string, ParsedGrade>();
  const topLevelSessionId =
    "session_id" in result.data ? result.data.session_id : null;

  for (const g of result.data.grades) {
    const sessionId = "session_id" in g ? g.session_id : topLevelSessionId;
    // Whitelist check
    if (!sessionId || !validSessionIds.has(sessionId)) continue;
    if (!validQIdxes.has(g.q_idx)) continue;

    const key = `${sessionId}:${g.q_idx}`;
    seen.set(key, {
      session_id: sessionId,
      q_idx: g.q_idx,
      score: Math.min(100, Math.max(0, Math.round(g.score))),
      comment: g.comment,
    });
  }

  const grades = [...seen.values()];
  return grades.length > 0 ? grades : null;
}

// ─── buildProposedGradesMap ───────────────────────────────────────────────────

/**
 * Convert ParsedGrade[] to a nested map for easy lookup and JSON storage.
 */
export function buildProposedGradesMap(grades: ParsedGrade[]): ProposedGradesMap {
  const map: ProposedGradesMap = {};
  for (const g of grades) {
    if (!map[g.session_id]) map[g.session_id] = {};
    map[g.session_id][g.q_idx] = { score: g.score, comment: g.comment };
  }
  return map;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * 샘플 학생 선정: 고르게 분포된 3명을 선택합니다.
 * - 기존 샘플이 있으면 유지 (재현성)
 * - 없으면 학생 목록을 sampleSize 구간으로 나눠 각 구간에서 1명씩 선택 (균등 분포)
 * - 학생이 sampleSize 미만이면 전원 선택
 */
export function selectCalibrationSampleSessionIds(
  submittedSessionIds: string[],
  existingSampleSessionIds: unknown,
  sampleSize = CALIBRATION_SAMPLE_SIZE,
  random = Math.random,
): string[] {
  const submitted = [...new Set(submittedSessionIds)];
  const submittedSet = new Set(submitted);
  const existing = asStringArray(existingSampleSessionIds).filter((sid) => submittedSet.has(sid));
  if (existing.length > 0) return existing;

  const n = submitted.length;
  if (n <= sampleSize) return submitted;

  // 균등 분포: 목록을 sampleSize 구간으로 나눠 각 구간에서 1명씩 무작위 선택
  const selected: string[] = [];
  const chunkSize = n / sampleSize;
  for (let i = 0; i < sampleSize; i++) {
    const start = Math.floor(i * chunkSize);
    const end = Math.min(Math.floor((i + 1) * chunkSize), n);
    const idx = start + Math.floor(random() * (end - start));
    selected.push(submitted[idx]);
  }
  return selected;
}

export function hasGradesForEveryExpectedQuestion(
  grades: ParsedGrade[],
  expectedQIdxes: Iterable<number>,
): boolean {
  const gradedQIdxes = new Set(grades.map((g) => g.q_idx));
  for (const qIdx of expectedQIdxes) {
    if (!gradedQIdxes.has(qIdx)) return false;
  }
  return true;
}

// ─── estimateTokenCount ───────────────────────────────────────────────────────

/** Rough token estimate (chars / 4). Used to detect context overflow risk. */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── loadExamMetaOnly ─────────────────────────────────────────────────────────

export type ExamMeta = {
  examId: string;
  examTitle: string;
  examDescription: string | null;
  examLanguage: "ko" | "en";
  caseQuestions: Array<{ qIdx: number; questionPrompt: string }>;
};

function summarizeJsonValue(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary : "";
  const strengths = Array.isArray(record.strengths)
    ? record.strengths.filter((v): v is string => typeof v === "string").slice(0, 3)
    : [];
  const weaknesses = Array.isArray(record.weaknesses)
    ? record.weaknesses.filter((v): v is string => typeof v === "string").slice(0, 3)
    : [];
  return [
    summary,
    strengths.length > 0 ? `강점: ${strengths.join(" / ")}` : "",
    weaknesses.length > 0 ? `보완점: ${weaknesses.join(" / ")}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Lightweight exam metadata query — no student data.
 * Used for criteria discussion chat (Phase A).
 */
export async function loadExamMetaOnly(
  supabase: ReturnType<typeof getSupabaseServer>,
  examId: string,
): Promise<ExamMeta> {
  const { data: exam, error } = await supabase
    .from("exams")
    .select("id, title, description, questions, language")
    .eq("id", examId)
    .single();

  if (error || !exam) throw new Error("Exam not found");

  const questions = normalizeQuestions(exam.questions);
  const caseQuestions = questions
    .filter((q) => isCaseQuestion(q.type))
    .map((q) => ({ qIdx: q.idx, questionPrompt: q.prompt ?? "" }));

  return {
    examId: exam.id as string,
    examTitle: exam.title as string,
    examDescription: (exam.description as string | null) ?? null,
    examLanguage: (exam.language as string) === "en" ? "en" : "ko",
    caseQuestions,
  };
}

// ─── loadSingleStudentCaseData ────────────────────────────────────────────────

/**
 * Load one student's case answers and chat logs.
 * Used by the QStash bulk grading worker (per-student).
 */
export async function loadSingleStudentCaseData(
  supabase: ReturnType<typeof getSupabaseServer>,
  studentSessionId: string,
  caseQIdxes: number[],
): Promise<BulkGradingStudentData> {
  if (caseQIdxes.length === 0) {
    return { studentName: "Unknown", sessionId: studentSessionId, answers: [] };
  }

  const [submissionsResult, messagesResult, sessionResult] = await Promise.all([
    supabase
      .from("submissions")
      .select("session_id, q_idx, answer, compressed_answer_data, created_at, id")
      .eq("session_id", studentSessionId)
      .in("q_idx", caseQIdxes),
    supabase
      .from("messages")
      .select("session_id, q_idx, role, content, compressed_content, created_at")
      .eq("session_id", studentSessionId)
      .in("q_idx", caseQIdxes)
      .in("role", ["user", "ai"])
      .order("created_at", { ascending: true }),
    supabase
      .from("sessions")
      .select("student_id, ai_summary")
      .eq("id", studentSessionId)
      .single(),
  ]);

  let studentName = `Student ${studentSessionId.slice(0, 8)}`;
  if (sessionResult.data?.student_id) {
    const { data: profile } = await supabase
      .from("student_profiles")
      .select("name")
      .eq("student_id", sessionResult.data.student_id as string)
      .maybeSingle();
    if (profile?.name) studentName = profile.name as string;
  }

  if (submissionsResult.error) {
    logError("loadSingleStudentCaseData: submissions query failed", submissionsResult.error, {
      path: "lib/bulk-grading.ts",
      additionalData: { studentSessionId, caseQIdxes },
    });
    throw new Error("Failed to load submissions");
  }

  if (messagesResult.error) {
    logError("loadSingleStudentCaseData: messages query failed", messagesResult.error, {
      path: "lib/bulk-grading.ts",
      additionalData: { studentSessionId, caseQIdxes },
    });
  }

  const decompressedSubs = decompressSubmissions(
    (submissionsResult.data ?? []) as Array<Record<string, unknown>>,
  );
  const decompressedMsgs = decompressMessages(
    (messagesResult.data ?? []) as Array<Record<string, unknown>>,
  );

  const answers: BulkGradingAnswer[] = caseQIdxes.map((qIdx) => {
    const sub = decompressedSubs[qIdx];
    const msgs = decompressedMsgs[qIdx] ?? [];
    const answer = sub?.answer ? sub.answer.slice(0, ANSWER_MAX_CHARS) : "";
    const chatLines = msgs
      .map((m) => {
        const roleLabel = m.role === "user" ? "Student" : m.role === "ai" ? "AI" : m.role;
        return `${roleLabel}: ${m.content}`;
      })
      .join("\n\n");
    return {
      qIdx,
      questionPrompt: "",
      answer,
      chatSummary: chatLines.slice(0, CHAT_MAX_CHARS),
    };
  });

  return {
    studentName,
    sessionId: studentSessionId,
    answers,
    overallSummary: summarizeJsonValue(sessionResult.data?.ai_summary),
  };
}

export async function loadCalibrationSampleData(
  supabase: ReturnType<typeof getSupabaseServer>,
  sampleSessionIds: string[],
  caseQIdxes: number[],
): Promise<BulkGradingStudentData[]> {
  const students = await Promise.all(
    sampleSessionIds.map((sid) => loadSingleStudentCaseData(supabase, sid, caseQIdxes)),
  );
  return students;
}
