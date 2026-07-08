import { NextRequest } from "next/server";

export const maxDuration = 60;
import { errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { currentUser } from "@/lib/get-current-user";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  createExamSchema,
  updateExamSchema,
  initExamSessionSchema,
  createOrGetSessionSchema,
  sessionHeartbeatSchema,
  deactivateSessionSchema,
  saveDraftSchema,
  saveAllDraftsSchema,
  saveDraftAnswersSchema,
  submitExamSchema,
  createFolderSchema,
  moveNodeSchema,
  deleteNodeSchema,
  copyExamSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  saveCanvasSchema,
  submitAssignmentSchema,
  saveFinalAnswerSchema,
  validateRequest,
} from "@/lib/validations";
import type { z } from "zod";

import {
  createExam,
  updateExam,
  getExam,
  getExamById,
  getInstructorExams,
  copyExam,
} from "./handlers/exam-handlers";

import {
  createOrGetSession,
  initExamSession,
  submitExam,
  sessionHeartbeat,
  deactivateSession,
  checkExamGateStatus,
} from "./handlers/session-handlers";

import {
  saveDraft,
  saveAllDrafts,
  saveDraftAnswers,
  getSessionSubmissions,
  getSessionMessages,
} from "./handlers/submission-handlers";

import {
  createFolder,
  getFolderContents,
  getBreadcrumb,
  moveNode,
  updateNode,
  deleteNode,
  getInstructorDrive,
} from "./handlers/drive-handlers";

import {
  createAssignment,
  updateAssignment,
  saveCanvas,
  submitAssignment,
  saveFinalAnswer,
} from "./handlers/assignment-handlers";

// Default-deny: all actions require auth unless explicitly listed as public.
// Add to this set only for truly unauthenticated use cases.
const publicActions = new Set<string>(["get_exam"]);

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      return errorJson("INVALID_JSON", "Invalid JSON in request body", 400);
    }

    const { action, data: rawData } = body;

    if (!action) {
      return errorJson("MISSING_ACTION", "Missing 'action' field in request", 400);
    }

    let authedUser = null;

    if (!publicActions.has(action)) {
      authedUser = await currentUser();
      if (!authedUser) {
        return errorJson("UNAUTHORIZED", "Unauthorized", 401);
      }
    } else {
      // Public actions have no user to key on — rate limit by IP so a bare exam
      // code can't be brute-forced / scraped through these endpoints.
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const rl = await checkRateLimitAsync(`supa:${action}:${ip}`, RATE_LIMITS.publicSearch);
      if (!rl.allowed) {
        return errorJson("RATE_LIMITED", "Too many requests", 429);
      }
    }

    // Rate limit sensitive actions at handler level
    const rateLimitedActions: Record<string, { limit: number; windowSec: number }> = {
      create_assignment: RATE_LIMITS.examControl,
      update_assignment: RATE_LIMITS.examControl,
      submit_assignment: RATE_LIMITS.examControl,
      save_canvas: RATE_LIMITS.general,
      save_final_answer: RATE_LIMITS.finalAnswerSave,
      create_exam: RATE_LIMITS.examControl,
      submit_exam: RATE_LIMITS.examControl,
      save_draft: RATE_LIMITS.general,
      save_all_drafts: RATE_LIMITS.general,
      save_draft_answers: RATE_LIMITS.general,
      check_exam_gate_status: RATE_LIMITS.sessionRead,
      session_heartbeat: RATE_LIMITS.sessionRead,
    };

    if (action in rateLimitedActions) {
      const rateLimitUser = authedUser || (await currentUser());
      if (rateLimitUser) {
        const rl = await checkRateLimitAsync(`supa:${action}:${rateLimitUser.id}`, rateLimitedActions[action]);
        if (!rl.allowed) {
          return errorJson("RATE_LIMITED", "Too many requests", 429);
        }
      }
    }

    // Validate input data against action-specific schemas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actionSchemas: Record<string, z.ZodSchema<any>> = {
      create_assignment: createAssignmentSchema,
      update_assignment: updateAssignmentSchema,
      save_canvas: saveCanvasSchema,
      submit_assignment: submitAssignmentSchema,
      save_final_answer: saveFinalAnswerSchema,
      create_exam: createExamSchema,
      update_exam: updateExamSchema,
      init_exam_session: initExamSessionSchema,
      create_or_get_session: createOrGetSessionSchema,
      session_heartbeat: sessionHeartbeatSchema,
      deactivate_session: deactivateSessionSchema,
      save_draft: saveDraftSchema,
      save_all_drafts: saveAllDraftsSchema,
      save_draft_answers: saveDraftAnswersSchema,
      submit_exam: submitExamSchema,
      create_folder: createFolderSchema,
      move_node: moveNodeSchema,
      delete_node: deleteNodeSchema,
      copy_exam: copyExamSchema,
    };

    let data = rawData;
    const schema = actionSchemas[action];
    if (schema) {
      const validation = validateRequest(schema, rawData);
      if (!validation.success) {
        return errorJson("VALIDATION_ERROR", validation.error, 400);
      }
      data = validation.data;
    }

    switch (action) {
      case "create_assignment":
        return await createAssignment(data);
      case "update_assignment":
        return await updateAssignment(data);
      case "save_canvas":
        return await saveCanvas(data);
      case "submit_assignment":
        return await submitAssignment(data);
      case "save_final_answer":
        return await saveFinalAnswer(data);
      case "create_exam":
        return await createExam(data);
      case "update_exam":
        return await updateExam(data);
      case "submit_exam":
        return await submitExam(data);
      case "get_exam":
        return await getExam(data);
      case "get_exam_by_id":
        return await getExamById(data);
      case "get_instructor_exams":
        return await getInstructorExams();
      case "create_or_get_session":
        return await createOrGetSession(data);
      case "init_exam_session": // New optimized action
        return await initExamSession(data);
      case "save_draft":
        return await saveDraft(data);
      case "save_all_drafts":
        return await saveAllDrafts(data);
      case "save_draft_answers":
        return await saveDraftAnswers(data);
      case "get_session_submissions":
        return await getSessionSubmissions(data);
      case "get_session_messages":
        return await getSessionMessages(data);
      case "session_heartbeat":
        return await sessionHeartbeat(data);
      case "deactivate_session":
        return await deactivateSession(data);
      case "check_exam_gate_status":
        return await checkExamGateStatus(data);
      case "create_folder":
        return await createFolder(data);
      case "get_folder_contents":
        return await getFolderContents(data);
      case "get_breadcrumb":
        return await getBreadcrumb(data);
      case "move_node":
        return await moveNode(data);
      case "update_node":
        return await updateNode(data);
      case "delete_node":
        return await deleteNode(data);
      case "get_instructor_drive":
        return await getInstructorDrive();
      case "copy_exam":
        return await copyExam(data);
      default:
        logError("Invalid supa action received", new Error("INVALID_ACTION"), { additionalData: { action } });
        return errorJson("INVALID_ACTION", "Invalid action", 400);
    }
  } catch (error) {
    logError("Supa route handler failed", error, { path: "/api/supa" });
    return errorJson(
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      500
    );
  }
}
