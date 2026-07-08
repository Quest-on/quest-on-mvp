import { z } from "zod";
import { sanitizeUserInput } from "@/lib/sanitize";

// AI 문항 생성 상한. 스트림 라우트가 문항당 병렬 OpenAI 호출을 발사하므로
// (비용·rate-limit 폭주 방지) 보수적으로 유지한다.
const MAX_GENERATED_QUESTION_COUNT = 10;

// Reusable field schemas
const sessionId = z.string().uuid("Invalid session ID format");

// Sanitized string: strips XSS vectors at validation time
const sanitizedString = (schema: z.ZodString) => schema.transform(sanitizeUserInput);

// ========== Task Type & Workspace Schemas ==========

export const taskTypeSchema = z.enum(["exam", "report", "code", "erd", "mindmap"]);

export const codeLanguageSchema = z.enum([
  "sql", "python", "javascript", "typescript", "java", "c", "cpp", "go", "rust", "plaintext",
]);

const erdColumnSchema = z.object({
  name: z.string().max(100),
  type: z.string().max(100),
  isPrimary: z.boolean().optional(),
  isForeignKey: z.boolean().optional(),
  references: z.string().max(200).optional(),
});

const erdNodeSchema = z.object({
  id: z.string(),
  type: z.literal("table"),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    tableName: z.string().max(100),
    columns: z.array(erdColumnSchema).max(50),
  }),
});

const erdEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().max(100).optional(),
  type: z.enum(["one-to-one", "one-to-many", "many-to-many"]).optional(),
});

const erdStateSchema = z.object({
  nodes: z.array(erdNodeSchema).max(100),
  edges: z.array(erdEdgeSchema).max(200),
});

export const workspaceStateSchema = z.object({
  code: z.string().max(200000),
  language: codeLanguageSchema,
  erd: erdStateSchema,
  notes: z.string().max(200000),
  lastUpdated: z.string(),
});

export const initialStateSchema = z.object({
  starterCode: z.string().max(100000).optional(),
  language: codeLanguageSchema.optional(),
  initialErd: erdStateSchema.optional(),
  instructions: z.string().max(10000).optional(),
});

export const canvasConfigSchema = z.object({
  secondaryCanvas: z.boolean(),
  layout: z.enum(["horizontal", "vertical"]).optional(),
  codeEnabled: z.boolean().optional(),
  erdEnabled: z.boolean().optional(),
  notesEnabled: z.boolean().optional(),
});

// ========== Exam JSON Column Schemas ==========
// These validate the JSON stored in exams.questions and exams.materials

export const examQuestionItemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  text: z.string().optional(),
  prompt: z.string().optional(),
  type: z.string().optional(),
  idx: z.number().optional(),
  ai_context: z.string().optional().nullable(),
  options: z.array(z.string()).optional(),
  correctOptionIndex: z.number().int().min(0).optional(),
  points: z.number().optional(),
});

/** 문제 유형 enum — 시험/과제 전반에서 단일 소스로 공유. */
export const questionTypeEnum = z.enum([
  "multiple-choice",
  "true-false",
  "essay",
  "short-answer",
]);

export const examQuestionsSchema = z.array(examQuestionItemSchema);

export const examMaterialsSchema = z.array(z.string());

export const scoreWeightsSchema = z
  .object({
    version: z.literal(1).default(1),
    typeWeights: z
      .object({
        "multiple-choice": z.number().int().min(1).max(100).optional(),
        "true-false": z.number().int().min(1).max(100).optional(),
        case: z.number().int().min(1).max(100).optional(),
      })
      .strict(),
    distribution: z.literal("equal_by_type").default("equal_by_type"),
  })
  .strict();

/** Safely parse JSON column with Zod schema, returning fallback on failure */
export function safeParseJson<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fallback: T
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  console.warn("[safeParseJson] Validation failed:", result.error.errors[0]?.message);
  return fallback;
}

// Chat API
export const chatRequestSchema = z.object({
  message: sanitizedString(z.string().min(1, "Message is required").max(10000, "Message too long")),
  sessionId: z.string().min(1, "Session ID is required"),
  questionId: z.string().optional(),
  questionIdx: z.union([z.number(), z.string()]).optional(),
  examTitle: z.string().optional(),
  examCode: z.string().optional(),
  examId: z.string().optional(),
  studentId: z.string().optional(),
  currentQuestionText: sanitizedString(z.string()).optional(),
  currentQuestionAiContext: sanitizedString(z.string()).optional(),
});

// Instructor Chat API
export const instructorChatRequestSchema = z.object({
  message: sanitizedString(z.string().min(1, "Message is required").max(10000, "Message too long")),
  sessionId: z.string().min(1),
  context: z.string().min(1, "Context is required"),
  scopeDescription: z.string().optional(),
  userId: z.string().optional(),
});

// Submission Reply API
export const submissionReplySchema = z.object({
  studentReply: sanitizedString(z.string().min(1, "Student reply is required").max(100000)),
  sessionId: sessionId,
  qIdx: z.number().int().min(0),
});

// Paste Log API
export const pasteLogSchema = z.object({
  length: z.number().optional(),
  pasted_text: z.string().max(50000).optional(),
  paste_start: z.number().optional().nullable(),
  paste_end: z.number().optional().nullable(),
  answer_length_before: z.number().optional().nullable(),
  isInternal: z.boolean().optional(),
  ts: z.union([z.string(), z.number()]),
  examCode: z.string().optional(),
  questionId: z.string().optional(),
  sessionId: sessionId,
});

// Admin Auth API
export const adminAuthSchema = z.object({
  username: z.string().min(1, "Username is required").max(100),
  password: z.string().min(1, "Password is required").max(200),
});

// Feedback API
export const feedbackRequestSchema = z.object({
  message: sanitizedString(z.string().min(1).max(10000)),
  examCode: z.string().min(1),
  studentId: z.string().min(1),
  sessionId: z.string().optional(),
  questionIdx: z.number().int().min(0).optional(),
});

// Grade API
export const gradeUpdateSchema = z.object({
  grades: z.array(
    z.object({
      q_idx: z.number().int().min(0),
      score: z.number().min(0).max(100),
      comment: z.string().max(5000).optional().transform(v => v ? sanitizeUserInput(v) : v),
    })
  ),
});

// Single grade update (POST body for individual grade save)
export const singleGradeUpdateSchema = z.object({
  questionIdx: z.number().int().min(0),
  score: z.number().min(0).max(100),
  comment: z.string().max(5000).optional().transform(v => v ? sanitizeUserInput(v) : v),
  stageGrading: z.unknown().optional(),
  expected_updated_at: z.string().optional(),
});

export const caseGradeChatPostSchema = z.object({
  qIdx: z.number().int().min(0),
  message: sanitizedString(z.string().min(1, "Message is required").max(10000)),
  clientMessageId: z.string().uuid("Invalid clientMessageId"),
});

export const caseGradeCommitSchema = z.object({
  qIdx: z.number().int().min(0),
  score: z.number().min(0).max(100),
  comment: z.string().max(5000).optional().transform((v) => (v ? sanitizeUserInput(v) : v)),
});

export const bulkGradeChatPostSchema = z.union([
  z.object({
    init: z.literal(true),
    message: z.undefined().optional(),
  }),
  z.object({
    completeInterview: z.literal(true),
    scoreMin: z.number().int().min(0).max(100).optional(),
    scoreMax: z.number().int().min(0).max(100).optional(),
  }),
  z.object({
    init: z.undefined().optional(),
    completeInterview: z.undefined().optional(),
    message: sanitizedString(z.string().min(1, "Message is required").max(10000)),
    clientMessageId: z.string().uuid("Invalid clientMessageId"),
  }),
]);

export const bulkGradeWorkerSchema = z.object({
  gradingSessionId: z.string().uuid("Invalid gradingSessionId"),
  studentSessionId: z.string().uuid("Invalid studentSessionId"),
  examId: z.string().uuid("Invalid examId"),
  scope: z.enum(["sample", "full"]).default("full"),
  attemptId: z.string().uuid("Invalid attemptId").optional(),
});

export const bulkGradeCommitSchema = z.object({
  grades: z
    .array(
      z.object({
        session_id: z.string().uuid("Invalid session ID"),
        q_idx: z.number().int().min(0),
        score: z.number().int().min(0).max(100),
        comment: z
          .string()
          .max(2000)
          .optional()
          .transform((v) => (v ? sanitizeUserInput(v) : v)),
      }),
    )
    .min(1, "At least one grade is required")
    .max(500, "Too many grades"),
});

// Supa route action schema
export const supaActionSchema = z.object({
  action: z.string().min(1),
});

// ========== Supa Route Action Schemas ==========

// Exam creation/update
export const createExamSchema = z.object({
  title: sanitizedString(z.string().min(1, "Title is required").max(500)),
  code: z.string().min(1).max(20),
  duration: z.number().int().min(0),
  chat_weight: z.number().min(0).max(100).nullable().optional(),
  score_weights: scoreWeightsSchema.nullable().optional(),
  questions: z.array(z.object({
    id: z.string(),
    text: z.string(),
    type: questionTypeEnum,
    options: z.array(z.string()).optional(),
    correctOptionIndex: z.number().int().min(0).optional(),
  }).passthrough()
    .refine(
      (q) =>
        (q.type !== "multiple-choice" && q.type !== "true-false") ||
        typeof q.correctOptionIndex === "number",
      {
        message: "객관식 문제에 정답이 지정되지 않았습니다.",
        path: ["correctOptionIndex"],
      },
    )
    .refine(
      (q) => {
        if (q.type !== "multiple-choice") return true;
        const opts = q.options ?? [];
        return (
          opts.length >= 4 && opts.slice(0, 4).every((o) => o.trim() !== "")
        );
      },
      {
        message: "사지선다 문제의 선택지 4개를 모두 입력해주세요.",
        path: ["options"],
      },
    )
    .refine(
      (q) => {
        if (q.type !== "true-false") return true;
        const opts = q.options ?? [];
        return opts.length >= 2 && opts.slice(0, 2).every((o) => o.trim() !== "");
      },
      {
        message: "O/X 문제의 선택지 2개를 모두 입력해주세요.",
        path: ["options"],
      },
    )
    .refine(
      (q) => {
        if (q.type !== "multiple-choice" && q.type !== "true-false") return true;
        if (typeof q.correctOptionIndex !== "number") return true; // caught by prior refine
        const opts = q.options ?? [];
        return q.correctOptionIndex < opts.length;
      },
      {
        message: "정답 인덱스가 선택지 범위를 벗어났습니다.",
        path: ["correctOptionIndex"],
      },
    )),
  materials: z.array(z.string()).optional(),
  materials_text: z.array(z.object({
    url: z.string(),
    text: z.string(),
    fileName: z.string(),
  })).optional(),
  status: z.string().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  parent_folder_id: z.string().nullable().optional(),
  language: z.enum(["ko", "en"]).optional(),
});

export const updateExamSchema = z.object({
  id: z.string().uuid("Invalid exam ID"),
  update: z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(2000).nullable().optional(),
    duration: z.number().int().min(0).optional(),
    questions: z.unknown().optional(),
    materials: z.array(z.string()).optional(),
    materials_text: z.array(z.object({
      url: z.string(),
      text: z.string(),
      fileName: z.string(),
    })).optional(),
    status: z.string().optional(),
    code: z.string().min(1).max(20).optional(),
    chat_weight: z.number().min(0).max(100).nullable().optional(),
    score_weights: scoreWeightsSchema.nullable().optional(),
    open_at: z.string().nullable().optional(),
    close_at: z.string().nullable().optional(),
    started_at: z.string().nullable().optional(),
    allow_draft_in_waiting: z.boolean().optional(),
    allow_chat_in_waiting: z.boolean().optional(),
    updated_at: z.string().optional(),
    language: z.enum(["ko", "en"]).optional(),
  }).strict(),
});

// Session operations
export const initExamSessionSchema = z.object({
  examCode: z.string().min(1, "Exam code is required").max(20),
  studentId: z.string().min(1, "Student ID is required"),
  deviceFingerprint: z.string().optional(),
});

export const createOrGetSessionSchema = z.object({
  examId: z.string().uuid("Invalid exam ID"),
  studentId: z.string().min(1, "Student ID is required"),
});

export const sessionHeartbeatSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  studentId: z.string().min(1, "Student ID is required"),
});

export const deactivateSessionSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  studentId: z.string().min(1, "Student ID is required"),
});

// Draft operations
export const saveDraftSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  questionId: z.string().min(1),
  answer: z.string().max(100000, "Answer too long"),
});

export const saveAllDraftsSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  drafts: z.array(z.object({
    questionId: z.string(),
    text: z.string().max(100000),
  })).max(50),
});

export const saveDraftAnswersSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  answers: z.array(z.object({
    questionId: z.string(),
    text: z.string().max(100000),
  })),
});

// Chat history item schema — validates structure and sanitizes message content
const chatHistoryItemSchema = z.object({
  role: z.string().max(20),
  message: z.string().max(50000).transform(sanitizeUserInput),
  timestamp: z.string().optional(),
  qIdx: z.union([z.number(), z.string()]).optional(),
});

// Answer item schema — validates structure (rich text HTML preserved)
const answerItemSchema = z.object({
  text: z.string().max(100000, "Answer too long"),
}).passthrough(); // allow extra fields (e.g. questionId) but ensure text is validated

// Exam submission
export const submitExamSchema = z.object({
  examId: z.string().uuid("Invalid exam ID"),
  studentId: z.string().min(1),
  sessionId: z.string().uuid("Invalid session ID"),
  answers: z.array(answerItemSchema).max(100),
  chatHistory: z.array(chatHistoryItemSchema).max(500).optional(),
  feedback: z.string().optional(),
  feedbackResponses: z.array(z.unknown()).optional(),
});

// Assignment operations
export const createAssignmentSchema = z.object({
  title: sanitizedString(z.string().min(1, "Title is required").max(500)),
  code: z.string().min(1).max(20),
  deadline: z.string().min(1, "Deadline is required"), // ISO datetime string
  chat_weight: z.number().min(0).max(100).nullable().optional(),
  questions: z.array(z.object({
    id: z.string(),
    text: z.string(),
    type: questionTypeEnum,
    options: z.array(z.string()).optional(),
    correctOptionIndex: z.number().int().min(0).optional(),
  }).passthrough()),
  materials: z.array(z.string()).optional(),
  materials_text: z.array(z.object({
    url: z.string(),
    text: z.string(),
    fileName: z.string(),
  })).optional(),
  status: z.string().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  parent_folder_id: z.string().nullable().optional(),
  assignment_prompt: z.string().max(10000).optional(),
  type: taskTypeSchema.optional(),
  initial_state: initialStateSchema.optional(),
  canvas_config: canvasConfigSchema.optional(),
  language: z.enum(["ko", "en"]).optional(),
});

export const saveCanvasSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  content: z.string().max(500000, "Canvas content too long"),
  workspace_state: workspaceStateSchema.optional(),
});

export const submitAssignmentSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  examId: z.string().uuid("Invalid exam ID"),
  studentId: z.string().min(1),
});

export const saveFinalAnswerSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  examId: z.string().uuid("Invalid exam ID"),
  studentId: z.string().min(1),
  finalAnswer: z.string().max(50000, "Final answer too long"),
});

export const updateAssignmentSchema = z.object({
  id: z.string().uuid("Invalid assignment ID"),
  update: z.object({
    title: z.string().min(1).max(500).optional(),
    questions: z.unknown().optional(),
    language: z.enum(["ko", "en"]).optional(),
    deadline: z.string().nullable().optional(),
    close_at: z.string().nullable().optional(),
    updated_at: z.string().optional(),
  }).strict(),
});

// Drive operations
export const createFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(255),
  parent_id: z.string().uuid().nullable().optional(),
});

export const moveNodeSchema = z.object({
  node_id: z.string().uuid("Invalid node ID"),
  new_parent_id: z.string().uuid().nullable().optional(),
  new_sort_order: z.number().int().min(0).optional(),
});

export const deleteNodeSchema = z.object({
  node_id: z.string().uuid("Invalid node ID"),
});

export const copyExamSchema = z.object({
  exam_id: z.string().uuid("Invalid exam ID"),
});

// Feedback chat
export const feedbackChatSchema = z.object({
  message: sanitizedString(z.string().min(1, "Message is required").max(10000)),
  sessionId: z.string().min(1),
  qIdx: z.number().int().min(0),
  chatHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: sanitizedString(z.string().max(10000)),
  })).optional(),
  examCode: z.string().optional(),
  studentId: z.string().optional(),
});

// AI Case Question Generation
export const generateCaseQuestionsSchema = z.object({
  examTitle: z.string().min(1).max(500),
  topics: z.string().max(500).optional(),
  difficulty: z.enum(["basic", "intermediate", "advanced"]).default("intermediate"),
  questionCount: z.number().int().min(1).max(MAX_GENERATED_QUESTION_COUNT).default(2),
  customInstructions: z.string().max(2000).optional(),
  materialsText: z.array(z.object({
    url: z.string(),
    text: z.string(),
    fileName: z.string(),
  })).optional(),
  language: z.enum(["ko", "en"]).default("ko"),
  generationMode: z.enum(["case", "research-assignment"]).default("case"),
  /** 생성할 문제 유형. mcq=사지선다, true-false=O/X, case=사례형(서술). */
  questionType: z.enum(["mcq", "true-false", "case"]).default("case"),
});

// ── AI-generated objective question response validation ──
// Strictly validate the parsed AI output per question type before it is
// mapped into Question objects. MCQ: 4 options + index 0..3. TF: index 0..1.

export const aiMcqQuestionSchema = z.object({
  text: z.string().min(1).max(4000),
  options: z.array(z.string().min(1).max(500)).length(4),
  correctOptionIndex: z.number().int().min(0).max(3),
  rationale: z.string().max(1000).optional(),
});

export const aiTrueFalseQuestionSchema = z.object({
  text: z.string().min(1).max(4000),
  options: z.array(z.string().min(1).max(500)).length(2),
  correctOptionIndex: z.number().int().min(0).max(1),
  rationale: z.string().max(1000).optional(),
});

export const aiMcqResponseSchema = z.object({
  questions: z.array(aiMcqQuestionSchema).min(1),
});

export const aiTrueFalseResponseSchema = z.object({
  questions: z.array(aiTrueFalseQuestionSchema).min(1),
});

// AI Case Question Adjustment
export const adjustCaseQuestionSchema = z.object({
  // 빈 문자열 허용 — "AI로 문제 생성"은 빈 문제에서 시작한다(생성 모드).
  questionText: z.string(),
  instruction: z.string().min(1).max(2000),
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).optional(),
  examTitle: z.string().optional(),
  language: z.enum(["ko", "en"]).default("ko"),
  generationMode: z.enum(["case", "research-assignment"]).default("case"),
  /**
   * 수정 대상 문제의 유형. essay = 서술형(기본, 기존 동작), multiple-choice =
   * 사지선다, true-false = O/X. 객관식 유형은 본문 + 선택지 + 정답을 함께 생성한다.
   */
  questionType: z.enum(["multiple-choice", "true-false", "essay"]).default("essay"),
  /** 객관식 유형일 때, 반복 수정의 기준이 되는 현재 선택지들. */
  currentOptions: z.array(z.string()).optional(),
  /** 객관식 유형일 때, 반복 수정의 기준이 되는 현재 정답 인덱스. */
  currentCorrectOptionIndex: z.number().int().min(0).optional(),
});

// Helper to validate and return typed result or error response
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return {
      success: false,
      error: firstError
        ? `${firstError.path.join(".")}: ${firstError.message}`
        : "Invalid request body",
    };
  }
  return { success: true, data: result.data };
}

export const bulkGradeChatOptionsSchema = z.object({
  questionText: sanitizedString(z.string().min(1).max(2000)),
  gradingSessionId: z.string().uuid("Invalid gradingSessionId"),
});

// ========== Bulk Approve Schema ==========

export const bulkApproveSchema = z.object({
  sessionIds: z.array(z.string().uuid("Invalid session ID format")).min(1, "At least one session required").max(200, "Maximum 200 sessions per request"),
});
