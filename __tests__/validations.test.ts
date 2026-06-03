import { describe, it, expect } from "vitest";
import {
  validateRequest,
  chatRequestSchema,
  adminAuthSchema,
  createExamSchema,
  saveDraftSchema,
  submitExamSchema,
  sessionHeartbeatSchema,
  createFolderSchema,
  gradeUpdateSchema,
  saveFinalAnswerSchema,
  adjustCaseQuestionSchema,
  caseGradeChatPostSchema,
  bulkGradeChatPostSchema,
} from "@/lib/validations";

describe("validateRequest helper", () => {
  it("returns success with valid data", () => {
    const result = validateRequest(adminAuthSchema, {
      username: "admin",
      password: "secret",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("admin");
    }
  });

  it("returns error with invalid data", () => {
    const result = validateRequest(adminAuthSchema, {
      username: "",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("required");
    }
  });

  it("returns error for missing fields", () => {
    const result = validateRequest(adminAuthSchema, {});
    expect(result.success).toBe(false);
  });
});

describe("chatRequestSchema", () => {
  it("validates a valid chat request", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hello",
      sessionId: "abc-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty message", () => {
    const result = chatRequestSchema.safeParse({
      message: "",
      sessionId: "abc-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects message exceeding max length", () => {
    const result = chatRequestSchema.safeParse({
      message: "a".repeat(10001),
      sessionId: "abc-123",
    });
    expect(result.success).toBe(false);
  });
});

describe("grading chat clientMessageId schemas", () => {
  it("requires clientMessageId for case grading chat", () => {
    const missing = caseGradeChatPostSchema.safeParse({
      qIdx: 0,
      message: "평가해 주세요.",
    });
    expect(missing.success).toBe(false);

    const result = caseGradeChatPostSchema.safeParse({
      qIdx: 0,
      message: "평가해 주세요.",
      clientMessageId: "33333333-3333-4333-8333-333333333333",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid clientMessageId for case grading chat", () => {
    const result = caseGradeChatPostSchema.safeParse({
      qIdx: 0,
      message: "평가해 주세요.",
      clientMessageId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("requires clientMessageId for bulk grading chat messages", () => {
    const missing = bulkGradeChatPostSchema.safeParse({
      message: "기준을 확인해 주세요.",
    });
    expect(missing.success).toBe(false);

    const result = bulkGradeChatPostSchema.safeParse({
      message: "기준을 확인해 주세요.",
      clientMessageId: "44444444-4444-4444-8444-444444444444",
    });
    expect(result.success).toBe(true);
  });

  it("keeps bulk grading init payload valid without clientMessageId", () => {
    const result = bulkGradeChatPostSchema.safeParse({ init: true });
    expect(result.success).toBe(true);
  });
});

describe("createExamSchema", () => {
  const validExam = {
    title: "Test Exam",
    code: "ABC123",
    duration: 60,
    questions: [
      { id: "q1", text: "What is 1+1?", type: "essay" as const },
    ],
    status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("validates a valid exam", () => {
    const result = createExamSchema.safeParse(validExam);
    expect(result.success).toBe(true);
  });

  it("rejects exam without title", () => {
    const result = createExamSchema.safeParse({ ...validExam, title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects negative duration", () => {
    const result = createExamSchema.safeParse({ ...validExam, duration: -1 });
    expect(result.success).toBe(false);
  });

  it("accepts exam with chat weight", () => {
    const result = createExamSchema.safeParse({
      ...validExam,
      chat_weight: 40,
    });
    expect(result.success).toBe(true);
  });
});

describe("saveDraftSchema", () => {
  it("validates a valid draft", () => {
    const result = saveDraftSchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      questionId: "0",
      answer: "My answer",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid session UUID", () => {
    const result = saveDraftSchema.safeParse({
      sessionId: "not-a-uuid",
      questionId: "0",
      answer: "My answer",
    });
    expect(result.success).toBe(false);
  });

  it("rejects overly long answer", () => {
    const result = saveDraftSchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      questionId: "0",
      answer: "a".repeat(100001),
    });
    expect(result.success).toBe(false);
  });
});

describe("gradeUpdateSchema", () => {
  it("validates valid grades", () => {
    const result = gradeUpdateSchema.safeParse({
      grades: [
        { q_idx: 0, score: 85, comment: "Good work" },
        { q_idx: 1, score: 100 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects score above 100", () => {
    const result = gradeUpdateSchema.safeParse({
      grades: [{ q_idx: 0, score: 101 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects score below 0", () => {
    const result = gradeUpdateSchema.safeParse({
      grades: [{ q_idx: 0, score: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative question index", () => {
    const result = gradeUpdateSchema.safeParse({
      grades: [{ q_idx: -1, score: 50 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("sessionHeartbeatSchema", () => {
  it("validates valid heartbeat", () => {
    const result = sessionHeartbeatSchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      studentId: "user_abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty studentId", () => {
    const result = sessionHeartbeatSchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      studentId: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("createFolderSchema", () => {
  it("validates folder with null parent", () => {
    const result = createFolderSchema.safeParse({
      name: "My Folder",
      parent_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty folder name", () => {
    const result = createFolderSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("saveFinalAnswerSchema", () => {
  const validBase = {
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
    examId: "550e8400-e29b-41d4-a716-446655440001",
    studentId: "user_abc123",
    finalAnswer: "내가 정리한 리서치 내용입니다.",
  };

  it("validates well-formed input", () => {
    const result = saveFinalAnswerSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("allows empty string finalAnswer (clear-to-empty case)", () => {
    const result = saveFinalAnswerSchema.safeParse({ ...validBase, finalAnswer: "" });
    expect(result.success).toBe(true);
  });

  it("rejects non-uuid sessionId", () => {
    const result = saveFinalAnswerSchema.safeParse({ ...validBase, sessionId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects empty studentId", () => {
    const result = saveFinalAnswerSchema.safeParse({ ...validBase, studentId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects finalAnswer over 50,000 chars", () => {
    const result = saveFinalAnswerSchema.safeParse({
      ...validBase,
      finalAnswer: "a".repeat(50_001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts finalAnswer at exactly 50,000 chars", () => {
    const result = saveFinalAnswerSchema.safeParse({
      ...validBase,
      finalAnswer: "a".repeat(50_000),
    });
    expect(result.success).toBe(true);
  });
});

describe("adjustCaseQuestionSchema", () => {
  const validBase = {
    questionText: "기존 문제 본문입니다.",
    instruction: "난이도를 높여주세요",
  };

  it("validates an adjust request with existing question text", () => {
    const result = adjustCaseQuestionSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  // 회귀: "AI로 문제 생성"은 빈 문제(text:"")에서 시작하므로
  // questionText 빈 문자열을 허용해야 한다 (이전엔 min(1) 때문에 400).
  it("allows empty questionText (AI 문제 생성 — 빈 문제에서 생성)", () => {
    const result = adjustCaseQuestionSchema.safeParse({
      questionText: "",
      instruction: "다형성 개념을 묻는 사지선다 문제를 만들어줘",
      questionType: "multiple-choice",
      currentOptions: ["", "", "", ""],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty instruction", () => {
    const result = adjustCaseQuestionSchema.safeParse({
      ...validBase,
      instruction: "",
    });
    expect(result.success).toBe(false);
  });

  it("defaults questionType to essay", () => {
    const result = adjustCaseQuestionSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questionType).toBe("essay");
    }
  });
});
