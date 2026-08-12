import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  caseGradeCommitSchema,
  validateRequest,
} from "@/lib/validations";
import { upsertGradesBySessionQuestion } from "@/lib/grades-upsert";
import { requireCaseGradeAccess } from "@/lib/case-grade-access";
import { readMemoryFlags } from "@/lib/preferences/flags";
import { enqueueMemoryExtraction } from "@/lib/qstash";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    const body = await request.json();
    const validation = validateRequest(caseGradeCommitSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const { qIdx, score, comment } = validation.data;

    const access = await requireCaseGradeAccess(sessionId, user, qIdx, {
      requireGradable: true,
    });
    if (!access.ok) return access.response;

    const rl = await checkRateLimitAsync(
      `case-grade-commit:${access.ctx.user.id}`,
      RATE_LIMITS.general,
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const stageGrading = {
      answer: {
        score,
        comment: comment ?? "",
      },
    };

    await upsertGradesBySessionQuestion(
      access.ctx.supabase as never,
      [
        {
          session_id: sessionId,
          q_idx: qIdx,
          score,
          comment: comment ?? "",
          stage_grading: stageGrading,
          grade_type: "manual",
        },
      ],
      "case_grade_commit",
    );

    try {
      await auditLog({
        action: "grade_update",
        userId: access.ctx.user.id,
        targetId: sessionId,
        details: { qIdx, score, comment: comment?.slice(0, 200), source: "case_grade_commit" },
      });
    } catch (auditError) {
      logError("[case-grade commit] Audit log failed", auditError, {
        path: `/api/session/${sessionId}/case-grade/commit`,
      });
    }

    if (readMemoryFlags().extractionEnabled) {
      try {
        const { data: source, error: sourceError } = await access.ctx.supabase
          .from("grading_chats")
          .select("id")
          .eq("session_id", sessionId)
          .eq("q_idx", qIdx)
          .eq("role", "user")
          .eq("input_origin", "typed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sourceError) throw sourceError;
        if (source?.id) {
          const queued = await enqueueMemoryExtraction({
            sourceTable: "grading_chats",
            sourceRefId: source.id,
          });
          if (!queued.ok) {
            logError("[case-grade commit] Memory extraction was not queued", queued.error ?? null, {
              path: `/api/session/${sessionId}/case-grade/commit`,
              additionalData: { sourceRefId: source.id, reason: queued.reason },
            });
          }
        }
      } catch (enqueueError) {
        logError("[case-grade commit] Memory extraction enqueue failed", enqueueError, {
          path: `/api/session/${sessionId}/case-grade/commit`,
        });
      }
    }

    return successJson({ ok: true, qIdx, score });
  } catch (error) {
    logError("case-grade commit POST handler error", error, {
      path: "/api/session/case-grade/commit",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
