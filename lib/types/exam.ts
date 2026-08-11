/** Shared exam-related type definitions */

import type { TaskType, InitialState, CanvasConfig } from "./workspace";

export interface RubricItem {
  id?: string;
  evaluationArea: string;
  detailedCriteria: string;
}

export interface ExamQuestion {
  id: string;
  text: string;
  type: string;
  points?: number;
  title?: string;
  idx?: number;
  prompt?: string;
  ai_context?: string | null;
  options?: string[];
  rubric?: RubricItem[];
}

export interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: ExamQuestion[];
  status: string;
  startTime?: string;
  endTime?: string;
  rubric?: Array<{
    id?: string;
    evaluationArea: string;
    detailedCriteria: string;
  }>;
  rubric_public?: boolean;
  allow_draft_in_waiting?: boolean;
  allow_chat_in_waiting?: boolean;
  type?: TaskType;
  initial_state?: InitialState;
  canvas_config?: CanvasConfig;
}

export interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

export interface ExamSession {
  id: string;
  examCode: string;
  examTitle: string;
  status: "completed" | "in-progress" | "pending";
  score: number | null;
  maxScore: number | null;
  questionCount: number;
  submittedAt: string | null;
  createdAt: string;
  examId: string;
}

/** Instructor page types */
export interface InstructorExam extends Exam {
  createdAt: string;
  students: InstructorStudent[];
  open_at?: string | null;
  close_at?: string | null;
  started_at?: string | null;
  deadline?: string | null;
  assignment_prompt?: string | null;
  initial_state?: InitialState;
  canvas_config?: CanvasConfig;
  grades_released?: boolean;
  is_demo?: boolean;
}

export type GradeStatus = "ai_graded" | "manually_graded" | "pending";

export interface InstructorStudent {
  id: string;
  name: string;
  email: string;
  status: "not-started" | "in-progress" | "completed";
  score?: number;
  finalScore?: number;
  submittedAt?: string;
  createdAt?: string;
  student_number?: string;
  school?: string;
  questionCount?: number;
  answerLength?: number;
  isGraded?: boolean;
  autoSubmitted?: boolean;
  gradeType?: GradeStatus;
  aiComment?: string;
  gradingProgress?: import("./grading").GradingProgress | null;
}

export type SortOption = "score" | "questionCount" | "answerLength" | "submittedAt";
