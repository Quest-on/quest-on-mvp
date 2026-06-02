import { getTestSupabase, waitForTestSupabaseReady } from "./supabase-test-client";
import { assertSafeTestSupabaseUrl } from "./supabase-test-safety";
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
  assertSafeTestSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

  // Delete in FK dependency order
  const tables = [
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
