import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));

import {
  createAssignmentSchema,
  createExamSchema,
  updateAssignmentSchema,
  updateExamSchema,
} from "@/lib/validations";
import { createExam, updateExam } from "@/app/api/supa/handlers/exam-handlers";
import {
  createAssignment,
  updateAssignment,
} from "@/app/api/supa/handlers/assignment-handlers";

const INSTRUCTOR_ID = "instructor-1";
const EXAM_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";

type QueryResult = { data: unknown; error: unknown };

function createChain(result: QueryResult = { data: null, error: null }) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const builder = {
    inserted,
    updated,
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    insert: vi.fn((payload: unknown) => {
      inserted.push(payload);
      return builder;
    }),
    update: vi.fn((payload: unknown) => {
      updated.push(payload);
      return builder;
    }),
    delete: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

const examCreateInput = {
  title: "Course persistence exam",
  code: "ABC123",
  duration: 60,
  questions: [],
  status: "draft",
  created_at: "2026-08-12T00:00:00.000Z",
  updated_at: "2026-08-12T00:00:00.000Z",
};

const assignmentCreateInput = {
  title: "Course persistence assignment",
  code: "DEF456",
  deadline: "2026-08-20T14:59:00.000Z",
  questions: [{ id: "q1", text: "Write", type: "essay" }],
  status: "draft",
  created_at: "2026-08-12T00:00:00.000Z",
  updated_at: "2026-08-12T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
});

function mockExamCreate() {
  const exams = createChain();
  exams.single
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: { id: EXAM_ID }, error: null });
  const nodes = createChain();
  nodes.maybeSingle.mockResolvedValue({ data: null, error: null });
  nodes.single.mockResolvedValue({ data: { id: "node-1" }, error: null });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "exams") return exams;
    if (table === "exam_nodes") return nodes;
    throw new Error(`Unexpected table: ${table}`);
  });
  return exams;
}

function mockExamUpdate() {
  const exams = createChain({ data: { id: EXAM_ID }, error: null });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "exams") return exams;
    throw new Error(`Unexpected table: ${table}`);
  });
  return exams;
}

function mockAssignmentCreate() {
  const exams = createChain();
  supabaseMock.rpc.mockResolvedValue({
    data: { exam: { id: EXAM_ID }, exam_node: { id: "node-1" } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "exams") return exams;
    throw new Error(`Unexpected table: ${table}`);
  });
  return exams;
}

function mockAssignmentUpdate() {
  const exams = createChain();
  exams.maybeSingle.mockResolvedValue({
    data: {
      id: EXAM_ID,
      instructor_id: INSTRUCTOR_ID,
      type: "assignment",
      questions: [],
      ai_draft_questions: null,
    },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "exams") return exams;
    throw new Error(`Unexpected table: ${table}`);
  });
  return exams;
}

describe("course_id persistence", () => {
  it("create with course_id carries it into both exam and assignment persistence payloads", async () => {
    const examTable = mockExamCreate();
    const examResponse = await createExam({ ...examCreateInput, course_id: COURSE_ID });
    expect(examResponse.status).toBe(200);
    expect(examTable.inserted[0]).toMatchObject({ course_id: COURSE_ID });

    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
    const assignmentTable = mockAssignmentCreate();
    const assignmentResponse = await createAssignment({
      ...assignmentCreateInput,
      course_id: COURSE_ID,
    });
    expect(assignmentResponse.status).toBe(200);
    expect(assignmentTable.updated[0]).toMatchObject({ course_id: COURSE_ID });
  });

  it("create without course_id succeeds and omits it from both persistence payloads", async () => {
    const examTable = mockExamCreate();
    const examResponse = await createExam(examCreateInput);
    expect(examResponse.status).toBe(200);
    expect(examTable.inserted[0]).not.toHaveProperty("course_id");

    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
    const assignmentTable = mockAssignmentCreate();
    const assignmentResponse = await createAssignment(assignmentCreateInput);
    expect(assignmentResponse.status).toBe(200);
    expect(assignmentTable.updated[0]).not.toHaveProperty("course_id");
  });

  it("update with course_id null explicitly clears both record types", async () => {
    const examTable = mockExamUpdate();
    const examResponse = await updateExam({
      id: EXAM_ID,
      update: { course_id: null },
    });
    expect(examResponse.status).toBe(200);
    expect(examTable.updated[0]).toMatchObject({ course_id: null });

    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
    const assignmentTable = mockAssignmentUpdate();
    const assignmentResponse = await updateAssignment({
      id: EXAM_ID,
      update: { course_id: null },
    });
    expect(assignmentResponse.status).toBe(200);
    expect(assignmentTable.updated[0]).toMatchObject({ course_id: null });
  });

  it("update omitting course_id leaves it absent from both database payloads", async () => {
    const examTable = mockExamUpdate();
    const examResponse = await updateExam({ id: EXAM_ID, update: { duration: 90 } });
    expect(examResponse.status).toBe(200);
    expect(examTable.updated[0]).not.toHaveProperty("course_id");

    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
    const assignmentTable = mockAssignmentUpdate();
    const assignmentResponse = await updateAssignment({
      id: EXAM_ID,
      update: { language: "en" },
    });
    expect(assignmentResponse.status).toBe(200);
    expect(assignmentTable.updated[0]).not.toHaveProperty("course_id");
  });

  it("strict update schemas accept a UUID course_id", () => {
    expect(
      updateExamSchema.safeParse({ id: EXAM_ID, update: { course_id: COURSE_ID } }).success,
    ).toBe(true);
    expect(
      updateAssignmentSchema.safeParse({
        id: EXAM_ID,
        update: { course_id: COURSE_ID },
      }).success,
    ).toBe(true);
  });

  it("all create and update schemas reject malformed and empty course_id values", () => {
    const invalidValues = ["not-a-uuid", ""];
    for (const course_id of invalidValues) {
      expect(createExamSchema.safeParse({ ...examCreateInput, course_id }).success).toBe(false);
      expect(
        createAssignmentSchema.safeParse({ ...assignmentCreateInput, course_id }).success,
      ).toBe(false);
      expect(
        updateExamSchema.safeParse({ id: EXAM_ID, update: { course_id } }).success,
      ).toBe(false);
      expect(
        updateAssignmentSchema.safeParse({ id: EXAM_ID, update: { course_id } }).success,
      ).toBe(false);
    }
  });
});
