import { getTestSupabase, waitForTestSupabaseReady } from "./supabase-test-client";
import crypto from "crypto";

const supabase = getTestSupabase();

// --------------- ID generators ---------------

function uuid(): string {
  return crypto.randomUUID();
}

function examCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6), (byte) =>
    alphabet[byte % alphabet.length]
  ).join("");
}

// --------------- Seed functions ---------------

interface SeedExamOverrides {
  id?: string;
  title?: string;
  code?: string;
  status?: string;
  instructor_id?: string;
  duration?: number;
  questions?: unknown;
  rubric?: unknown;
  started_at?: string | null;
  open_at?: string | null;
  close_at?: string | null;
  allow_draft_in_waiting?: boolean;
  allow_chat_in_waiting?: boolean;
  grades_released?: boolean;
  score_weights?: unknown;
}

export async function seedExam(overrides: SeedExamOverrides = {}) {
  await waitForTestSupabaseReady();

  const id = overrides.id ?? uuid();
  const data = {
    id,
    title: overrides.title ?? "Test Exam",
    code: overrides.code ?? examCode(),
    status: overrides.status ?? "draft",
    instructor_id: overrides.instructor_id ?? "test-instructor-id",
    duration: overrides.duration ?? 60,
    questions: overrides.questions ?? [
      {
        id: "q-0",
        idx: 0,
        type: "essay",
        text: "Explain the concept of polymorphism in OOP.",
        prompt: "Explain the concept of polymorphism in OOP.",
        ai_context: "Focus on compile-time vs runtime polymorphism.",
      },
      {
        id: "q-1",
        idx: 1,
        type: "essay",
        text: "Describe the difference between a stack and a queue.",
        prompt: "Describe the difference between a stack and a queue.",
        ai_context: "Include real-world examples.",
      },
    ],
    rubric: overrides.rubric ?? [
      {
        evaluationArea: "Understanding of polymorphism",
        detailedCriteria: "Demonstrates clear understanding of compile-time and runtime polymorphism in OOP.",
      },
      {
        evaluationArea: "Understanding of data structures",
        detailedCriteria: "Accurately describes the differences between stack (LIFO) and queue (FIFO) with examples.",
      },
    ],
    started_at: overrides.started_at ?? null,
    open_at: overrides.open_at ?? null,
    close_at: overrides.close_at ?? null,
    allow_draft_in_waiting: overrides.allow_draft_in_waiting ?? false,
    allow_chat_in_waiting: overrides.allow_chat_in_waiting ?? false,
    grades_released: overrides.grades_released ?? false,
  };
  if ("score_weights" in overrides) {
    (data as Record<string, unknown>).score_weights = overrides.score_weights ?? null;
  }

  const { error } = await supabase.from("exams").insert(data);
  if (error) throw new Error(`seedExam failed: ${error.message}`);

  // Also create exam_node so the exam appears in the instructor drive UI
  const { error: nodeError } = await supabase.from("exam_nodes").insert({
    id: uuid(),
    instructor_id: data.instructor_id,
    parent_id: null,
    kind: "exam",
    name: data.title,
    exam_id: data.id,
    sort_order: 0,
  });
  if (nodeError) {
    // Non-critical: log but don't fail (some tests don't need nodes)
    console.warn(`seedExam: exam_nodes insert failed: ${nodeError.message}`);
  }

  return data;
}

interface SeedSessionOverrides {
  id?: string;
  status?: string;
  started_at?: string | null;
  submitted_at?: string | null;
  preflight_accepted_at?: string | null;
  attempt_timer_started_at?: string | null;
  auto_submitted?: boolean;
}

export async function seedSession(
  examId: string,
  studentId: string,
  overrides: SeedSessionOverrides = {}
) {
  const id = overrides.id ?? uuid();
  const data = {
    id,
    exam_id: examId,
    student_id: studentId,
    status: overrides.status ?? "not_joined",
    started_at: overrides.started_at ?? null,
    submitted_at: overrides.submitted_at ?? null,
    preflight_accepted_at: overrides.preflight_accepted_at ?? null,
    attempt_timer_started_at: overrides.attempt_timer_started_at ?? null,
    auto_submitted: overrides.auto_submitted ?? false,
    used_clarifications: 0,
  };

  const { error } = await supabase.from("sessions").insert(data);
  if (error) throw new Error(`seedSession failed: ${error.message}`);
  return data;
}

interface SeedSubmissionOverrides {
  id?: string;
  answer?: string;
  compressed_answer_data?: string | null;
  compression_metadata?: unknown;
}

export async function seedSubmission(
  sessionId: string,
  qIdx: number,
  overrides: SeedSubmissionOverrides = {}
) {
  const id = overrides.id ?? uuid();
  const data = {
    id,
    session_id: sessionId,
    q_idx: qIdx,
    answer: overrides.answer ?? `Sample answer for question ${qIdx}`,
    compressed_answer_data: overrides.compressed_answer_data ?? null,
    compression_metadata: overrides.compression_metadata ?? {},
  };

  const { error } = await supabase.from("submissions").insert(data);
  if (error) throw new Error(`seedSubmission failed: ${error.message}`);
  return data;
}

interface SeedMessageOverrides {
  id?: string;
  role?: string;
  content?: string;
  response_id?: string | null;
  message_type?: string | null;
}

export async function seedMessage(
  sessionId: string,
  qIdx: number,
  overrides: SeedMessageOverrides = {}
) {
  const id = overrides.id ?? uuid();
  const data = {
    id,
    session_id: sessionId,
    q_idx: qIdx,
    role: overrides.role ?? "user",
    content: overrides.content ?? "What is polymorphism?",
    response_id: overrides.response_id ?? null,
    message_type: overrides.message_type ?? "concept",
  };

  const { error } = await supabase.from("messages").insert(data);
  if (error) throw new Error(`seedMessage failed: ${error.message}`);
  return data;
}

export async function seedGrade(
  sessionId: string,
  qIdx: number,
  score: number,
  comment?: string,
  gradeType: string = "manual"
) {
  const id = uuid();
  const data = {
    id,
    session_id: sessionId,
    q_idx: qIdx,
    score,
    comment: comment ?? "Test grade comment",
    grade_type: gradeType,
  };

  const { error } = await supabase.from("grades").insert(data);
  if (error) throw new Error(`seedGrade failed: ${error.message}`);
  return data;
}

export async function seedStudentProfile(
  studentId: string,
  overrides: { name?: string; student_number?: string; school?: string } = {}
) {
  const data = {
    student_id: studentId,
    name: overrides.name ?? "Test Student",
    student_number: overrides.student_number ?? "2024-0001",
    school: overrides.school ?? "Test University",
  };

  const { error } = await supabase.from("student_profiles").upsert(data, {
    onConflict: "student_id",
  });
  if (error) throw new Error(`seedStudentProfile failed: ${error.message}`);
  return data;
}

interface SeedBulkGradingSessionOverrides {
  id?: string;
  instructor_id?: string;
  proposed_grades?: unknown;
  status?: string;
  committed_at?: string | null;
  grading_total?: number;
  grading_completed?: number;
  grading_failed_count?: number;
  grading_scope?: string;
  grading_criteria?: string | null;
  expected_session_ids?: unknown;
  calibration_status?: string;
  calibration_sample_session_ids?: unknown;
  calibration_sample_grades?: unknown;
  calibration_attempt?: number;
  current_attempt_id?: string | null;
  processed_session_ids?: unknown;
}

export async function seedBulkGradingSession(
  examId: string,
  overrides: SeedBulkGradingSessionOverrides = {}
) {
  const id = overrides.id ?? uuid();
  const data = {
    id,
    exam_id: examId,
    instructor_id: overrides.instructor_id ?? "test-instructor-id",
    proposed_grades: overrides.proposed_grades ?? {},
    status: overrides.status ?? "draft",
    committed_at: overrides.committed_at ?? null,
    grading_total: overrides.grading_total ?? 0,
    grading_completed: overrides.grading_completed ?? 0,
    grading_failed_count: overrides.grading_failed_count ?? 0,
    grading_scope: overrides.grading_scope ?? "full",
    grading_criteria: overrides.grading_criteria ?? null,
    expected_session_ids: overrides.expected_session_ids ?? [],
    calibration_status: overrides.calibration_status ?? "draft",
    calibration_sample_session_ids: overrides.calibration_sample_session_ids ?? [],
    calibration_sample_grades: overrides.calibration_sample_grades ?? {},
    calibration_attempt: overrides.calibration_attempt ?? 0,
    current_attempt_id: overrides.current_attempt_id ?? null,
    processed_session_ids: overrides.processed_session_ids ?? {},
  };

  const { error } = await supabase.from("exam_grading_sessions").insert(data);
  if (error) throw new Error(`seedBulkGradingSession failed: ${error.message}`);
  return data;
}

interface SeedBulkGradingMessageOverrides {
  id?: string;
  role?: "user" | "assistant";
  content?: string;
  created_by?: string | null;
}

export async function seedBulkGradingMessage(
  gradingSessionId: string,
  overrides: SeedBulkGradingMessageOverrides = {}
) {
  const id = overrides.id ?? uuid();
  const data = {
    id,
    session_id: gradingSessionId,
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "기존 CASE 가채점 대화입니다.",
    created_by: overrides.created_by ?? "test-instructor-id",
  };

  const { error } = await supabase.from("bulk_grading_messages").insert(data);
  if (error) throw new Error(`seedBulkGradingMessage failed: ${error.message}`);
  return data;
}

export async function getBulkGradingSession(examId: string) {
  const { data, error } = await supabase
    .from("exam_grading_sessions")
    .select("*")
    .eq("exam_id", examId)
    .single();
  if (error) throw new Error(`getBulkGradingSession failed: ${error.message}`);
  return data;
}

export async function getBulkGradingMessages(gradingSessionId: string) {
  const { data, error } = await supabase
    .from("bulk_grading_messages")
    .select("*")
    .eq("session_id", gradingSessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getBulkGradingMessages failed: ${error.message}`);
  return data ?? [];
}

interface SeedExamNodeOverrides {
  id?: string;
  kind?: "folder" | "exam";
  name?: string;
  parent_id?: string | null;
  instructor_id?: string;
  exam_id?: string | null;
  sort_order?: number;
}

export async function seedExamNode(overrides: SeedExamNodeOverrides = {}) {
  const id = overrides.id ?? uuid();
  const data = {
    id,
    kind: overrides.kind ?? "folder",
    name: overrides.name ?? "Test Folder",
    parent_id: overrides.parent_id ?? null,
    instructor_id: overrides.instructor_id ?? "test-instructor-id",
    exam_id: overrides.exam_id ?? null,
    sort_order: overrides.sort_order ?? 0,
  };

  const { error } = await supabase.from("exam_nodes").insert(data);
  if (error) throw new Error(`seedExamNode failed: ${error.message}`);
  return data;
}

// --------------- Cleanup ---------------

/**
 * Deletes all test data in correct FK order.
 * Safe to call multiple times.
 */
export async function cleanupTestData() {
  await waitForTestSupabaseReady();

  // Delete in FK dependency order
  const tables = [
    "bulk_grading_messages",
    "exam_grading_sessions",
    "grades",
    "messages",
    "submissions",
    "paste_logs",
    "sessions",
    "exam_material_chunks",
    "exam_nodes",
    "exams",
    "audit_logs",
    "error_logs",
    "student_profiles",
  ];

  for (const table of tables) {
    // Delete all rows — test DB only
    const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.warn(`cleanupTestData: failed to clean ${table}: ${error.message}`);
    }
  }
}

// --------------- Query helpers ---------------

export async function getExam(examId: string) {
  const { data, error } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();
  if (error) throw new Error(`getExam failed: ${error.message}`);
  return data;
}

export async function getSession(sessionId: string) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error(`getSession failed: ${error.message}`);
  return data;
}

export async function getSessionsByExam(examId: string) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("exam_id", examId);
  if (error) throw new Error(`getSessionsByExam failed: ${error.message}`);
  return data ?? [];
}

export async function getGrades(sessionId: string) {
  const { data, error } = await supabase
    .from("grades")
    .select("*")
    .eq("session_id", sessionId);
  if (error) throw new Error(`getGrades failed: ${error.message}`);
  return data ?? [];
}
