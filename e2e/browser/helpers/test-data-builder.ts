/**
 * Scenario builders for browser E2E tests.
 * Wraps e2e/helpers/seed.ts with common scenarios.
 */
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedMessage,
  seedGrade,
  seedStudentProfile,
  cleanupTestData,
  setStudentDisclosureAcknowledged,
} from "../../helpers/seed";

// --------------- scenario builders ---------------

interface StudentExamScenarioOptions {
  examStatus?: "draft" | "running" | "closed";
  sessionStatus?: "not_joined" | "joined" | "waiting" | "in_progress" | "submitted";
  withSubmissions?: boolean;
  withGrades?: boolean;
  withMessages?: boolean;
  /**
   * Whether the session should be seeded with preflight_accepted_at set.
   * Default: true for sessions that have moved past the preflight stage
   *   (waiting / in_progress / submitted), false otherwise (not_joined / joined).
   * Pass `true` explicitly to skip the preflight modal in tests that simulate
   * a session that has already accepted (e.g. "running exam reconciles a
   * stale joined session and enters the live exam immediately").
   */
  preflightAccepted?: boolean;
}

/**
 * Seed a complete student exam-taking scenario.
 * Returns all created entities for assertion in tests.
 */
export async function seedStudentExamScenario(
  opts: StudentExamScenarioOptions = {},
) {
  const {
    examStatus = "running",
    sessionStatus = "in_progress",
    withSubmissions = false,
    withGrades = false,
    withMessages = false,
    preflightAccepted,
  } = opts;

  const now = new Date().toISOString();

  const exam = await seedExam({
    status: examStatus,
    started_at: examStatus === "running" ? now : null,
    // Report page only exposes scores when grades are released; mirror that
    // state for scenarios that pre-seed grades.
    grades_released: withGrades === true,
  });

  await seedStudentProfile("test-student-id");

  const defaultPreflightAccepted =
    sessionStatus !== "not_joined" && sessionStatus !== "joined";
  const effectivePreflightAccepted =
    preflightAccepted ?? defaultPreflightAccepted;

  // preflight 를 이미 수락한 학생은 AI 고지도 확인한 사람이다. 세션 수락만
  // 심으면 AC-15 게이트가 최초 고지를 다시 띄운다(#482 에서 드러났다).
  // 수락 전이면 "처음 보는 학생" 으로 — 앞 테스트의 확인을 지운다.
  await setStudentDisclosureAcknowledged("test-student-id", effectivePreflightAccepted);

  const session = await seedSession(exam.id, "test-student-id", {
    status: sessionStatus,
    started_at:
      sessionStatus !== "not_joined" && sessionStatus !== "joined"
        ? now
        : null,
    preflight_accepted_at: effectivePreflightAccepted ? now : null,
    attempt_timer_started_at:
      sessionStatus === "in_progress" || sessionStatus === "submitted"
        ? now
        : null,
    submitted_at: sessionStatus === "submitted" ? now : null,
  });

  const submissions: Awaited<ReturnType<typeof seedSubmission>>[] = [];
  if (withSubmissions) {
    for (let i = 0; i < (exam.questions as unknown[]).length; i++) {
      const sub = await seedSubmission(session.id, i, {
        answer: `<p>Answer for question ${i}: This is a detailed response about the topic.</p>`,
      });
      submissions.push(sub);
    }
  }

  const grades: Awaited<ReturnType<typeof seedGrade>>[] = [];
  if (withGrades && withSubmissions) {
    for (let i = 0; i < (exam.questions as unknown[]).length; i++) {
      const grade = await seedGrade(session.id, i, 85, "Good answer");
      grades.push(grade);
    }
  }

  const messages: Awaited<ReturnType<typeof seedMessage>>[] = [];
  if (withMessages) {
    for (let i = 0; i < (exam.questions as unknown[]).length; i++) {
      const userMsg = await seedMessage(session.id, i, {
        role: "user",
        content: "Can you explain this concept?",
      });
      const aiMsg = await seedMessage(session.id, i, {
        role: "assistant",
        content: "Sure! Here is an explanation of the concept...",
      });
      messages.push(userMsg, aiMsg);
    }
  }

  return { exam, session, submissions, grades, messages };
}

interface InstructorGradingScenarioOptions {
  questionCount?: number;
  studentCount?: number;
}

/**
 * Seed a scenario ready for instructor grading.
 */
export async function seedInstructorGradingScenario(
  opts: InstructorGradingScenarioOptions = {},
) {
  const { questionCount = 2, studentCount = 1 } = opts;

  const now = new Date().toISOString();

  const questions = Array.from({ length: questionCount }, (_, i) => ({
    id: `q-${i}`,
    idx: i,
    type: "essay" as const,
    text: `Question ${i + 1}: Explain the concept.`,
    prompt: `Question ${i + 1}: Explain the concept.`,
    ai_context: `Context for question ${i + 1}`,
  }));

  const rubric = Array.from({ length: questionCount }, (_, i) => ({
    evaluationArea: `Criteria for question ${i + 1}`,
    detailedCriteria: `Detailed evaluation criteria for question ${i + 1}.`,
  }));

  const exam = await seedExam({
    status: "closed",
    started_at: now,
    close_at: now,
    questions,
    rubric,
    // Scenario covers instructor grading → student report assertion, which
    // requires grades to be released so /api/student/session/[id]/report
    // exposes overallScore.
    grades_released: true,
  });

  const students: Array<{
    session: Awaited<ReturnType<typeof seedSession>>;
    submissions: Awaited<ReturnType<typeof seedSubmission>>[];
  }> = [];

  for (let s = 0; s < studentCount; s++) {
    const studentId = s === 0 ? "test-student-id" : `test-student-${s}`;
    await seedStudentProfile(studentId, {
      name: `Test Student ${s}`,
      student_number: `2024-${String(s).padStart(4, "0")}`,
    });
    const session = await seedSession(exam.id, studentId, {
      status: "submitted",
      started_at: now,
      submitted_at: now,
      preflight_accepted_at: now,
      attempt_timer_started_at: now,
    });

    const submissions: Awaited<ReturnType<typeof seedSubmission>>[] = [];
    for (let q = 0; q < questionCount; q++) {
      const sub = await seedSubmission(session.id, q, {
        answer: `Student ${s} answer to question ${q + 1}`,
      });
      submissions.push(sub);
    }

    students.push({ session, submissions });
  }

  return { exam, students };
}

// --------------- extended scenario builders ---------------

/**
 * Seed a completed exam scenario (submitted + graded).
 * Useful for report page tests.
 */
export async function seedCompletedExamScenario() {
  const now = new Date().toISOString();

  const questions = [
    {
      id: "q-0",
      idx: 0,
      type: "essay" as const,
      text: "Explain polymorphism.",
      prompt: "Explain polymorphism.",
      ai_context: "OOP concept",
    },
    {
      id: "q-1",
      idx: 1,
      type: "essay" as const,
      text: "Describe stack vs queue.",
      prompt: "Describe stack vs queue.",
      ai_context: "Data structures",
    },
  ];

  const rubric = [
    { evaluationArea: "Understanding of polymorphism", detailedCriteria: "Demonstrates clear understanding of polymorphism in OOP." },
    { evaluationArea: "Understanding of data structures", detailedCriteria: "Accurately describes the differences between stack and queue." },
  ];

  const exam = await seedExam({
    status: "running",
    started_at: now,
    questions,
    rubric,
  });

  await seedStudentProfile("test-student-id");

  const session = await seedSession(exam.id, "test-student-id", {
    status: "submitted",
    started_at: now,
    submitted_at: now,
    preflight_accepted_at: now,
    attempt_timer_started_at: now,
  });

  const submissions = [];
  for (let i = 0; i < questions.length; i++) {
    const sub = await seedSubmission(session.id, i, {
      answer: `Detailed answer for question ${i + 1}`,
    });
    submissions.push(sub);
  }

  const grades = [];
  for (let i = 0; i < questions.length; i++) {
    const grade = await seedGrade(session.id, i, 85 + i * 5, "Well done");
    grades.push(grade);
  }

  return { exam, session, submissions, grades };
}

interface MultiStudentOptions {
  studentCount?: number;
}

/**
 * Seed an exam with multiple students in various states.
 * Student 0 = "test-student-id" (submitted), others = "test-student-N" (various states).
 */
export async function seedMultiStudentExamScenario(
  opts: MultiStudentOptions = {},
) {
  const { studentCount = 3 } = opts;
  const now = new Date().toISOString();

  const exam = await seedExam({
    status: "running",
    started_at: now,
  });

  const statuses = ["submitted", "in_progress", "waiting"] as const;
  const students: Array<{
    studentId: string;
    session: Awaited<ReturnType<typeof seedSession>>;
  }> = [];

  for (let i = 0; i < studentCount; i++) {
    const studentId = i === 0 ? "test-student-id" : `test-student-${i}`;
    await seedStudentProfile(studentId, {
      name: `Test Student ${i}`,
      student_number: `2024-${String(i).padStart(4, "0")}`,
    });
    const status = statuses[i % statuses.length];
    const session = await seedSession(exam.id, studentId, {
      status,
      started_at: status !== "waiting" ? now : null,
      submitted_at: status === "submitted" ? now : null,
      attempt_timer_started_at: status === "in_progress" ? now : null,
    });
    students.push({ studentId, session });
  }

  return { exam, students };
}

// Re-export cleanup for convenience
export { cleanupTestData } from "../../helpers/seed";
