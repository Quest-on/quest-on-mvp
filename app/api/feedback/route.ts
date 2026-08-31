export const maxDuration = 300;

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { compressData } from "@/lib/compression";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { triggerGradingIfNeeded } from "@/lib/grading-trigger";
import { isDemoPreview } from "@/lib/demo-completion";
import { ONBOARDING_EVENTS, recordOnboardingEvent } from "@/lib/onboarding-events";

import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// Lazy Supabase getter — avoids stale module-level singleton in serverless
function getSupabase() {
  return getSupabaseServer();
}

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const {
      examCode,
      answers,
      examId: requestedExamId,
      sessionId,
      studentId,
    } =
      await request.json();

    if (!examCode || !answers || !Array.isArray(answers)) {
      return errorJson("BAD_REQUEST", "Missing required fields", 400);
    }

    if (studentId && studentId !== user.id) {
      return errorJson("FORBIDDEN", "Student ID mismatch", 403);
    }

    const verifiedStudentId = user.id;

    // Rate limit: submission triggers expensive auto-grading
    const rl = await checkRateLimitAsync(`submission:${user.id}`, RATE_LIMITS.submission);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many submissions. Please wait.", 429);
    }

    // Validate answer count and individual answer length
    const MAX_ANSWERS = 50;
    const MAX_ANSWER_LENGTH = 100_000;
    if (answers.length > MAX_ANSWERS) {
      return errorJson("BAD_REQUEST", "Too many answers", 400);
    }
    for (const a of answers) {
      const text = typeof a === "string" ? a : (a as Record<string, unknown>)?.text || "";
      if (typeof text === "string" && text.length > MAX_ANSWER_LENGTH) {
        return errorJson("BAD_REQUEST", "Answer too long", 400);
      }
    }

    // Validate exam submission from Supabase
    const { data: exam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, code, status, duration, is_demo, instructor_id")
      .eq("code", examCode)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (requestedExamId && requestedExamId !== exam.id) {
      return errorJson("BAD_REQUEST", "Exam ID mismatch", 400);
    }

    // Allow submission for draft exams (assignment type) and running exams
    // Note: exam status 체크를 session submitted_at 체크 이후로 지연하여
    // 강제 종료 후 레이스 컨디션에서 409(성공 처리)가 먼저 반환되도록 함
    const allowedStatuses = ["draft", "running"];
    const examClosed = !exam.status || !allowedStatuses.includes(exam.status);

    let ownedSession:
      | {
          id: string;
          student_id: string;
          exam_id: string;
          submitted_at: string | null;
          created_at: string;
          attempt_timer_started_at: string | null;
          started_at: string | null;
        }
      | null = null;

    if (sessionId) {
      const { data: existingSession, error: sessionError } = await getSupabase()
        .from("sessions")
        .select(
          "id, student_id, exam_id, submitted_at, created_at, attempt_timer_started_at, started_at"
        )
        .eq("id", sessionId)
        .single();

      if (sessionError || !existingSession) {
        return errorJson("NOT_FOUND", "Session not found", 404);
      }

      if (existingSession.student_id !== verifiedStudentId) {
        return errorJson("FORBIDDEN", "Session access denied", 403);
      }

      if (existingSession.exam_id !== exam.id) {
        return errorJson("BAD_REQUEST", "Session does not belong to this exam", 400);
      }

      if (existingSession.submitted_at) {
        return errorJson("ALREADY_SUBMITTED", "This session has already been submitted", 409);
      }

      ownedSession = existingSession;
    }

    // 시험이 종료된 경우 (session submitted_at 체크 이후에 수행하여 force-submit된 세션은 409로 즉시 반환)
    if (examClosed) {
      return errorJson("EXAM_CLOSED", "Exam is no longer active", 400);
    }

    // ✅ duration이 0이 아닐 때만 시간 만료 체크
    // duration === 0은 무제한(과제형)이므로 시간 체크를 건너뜀
    if (exam.duration !== 0 && ownedSession) {
      // Use attempt_timer_started_at (set when exam actually starts) > started_at > created_at
      const timerStart =
        ownedSession.attempt_timer_started_at ||
        ownedSession.started_at ||
        ownedSession.created_at;
      const sessionStartTime = new Date(timerStart).getTime();
      const examDurationMs = exam.duration * 60 * 1000; // 분을 밀리초로 변환
      const gracePeriodMs = 5 * 1000; // 5초 grace period — aligned with session-handlers GRACE_PERIOD_MS
      const sessionEndTime = sessionStartTime + examDurationMs + gracePeriodMs;
      const now = Date.now();

      // 시간이 지났으면 에러 반환 (단, duration이 0이 아닐 때만)
      if (now > sessionEndTime) {
        return errorJson("BAD_REQUEST", "시험 시간이 종료되었습니다.", 400);
      }
    }

    let actualSessionId = ownedSession?.id || null;

    try {
      if (!actualSessionId) {
        const { data: activeSession, error: activeSessionError } = await getSupabase()
          .from("sessions")
          .select("id")
          .eq("exam_id", exam.id)
          .eq("student_id", verifiedStudentId)
          .is("submitted_at", null)
          .maybeSingle();

        if (activeSessionError) {
          throw activeSessionError;
        }

        if (activeSession) {
          actualSessionId = activeSession.id;
        } else {
          const { data: submittedSession, error: submittedSessionError } =
            await getSupabase()
              .from("sessions")
              .select("id")
              .eq("exam_id", exam.id)
              .eq("student_id", verifiedStudentId)
              .not("submitted_at", "is", null)
              .maybeSingle();

          if (submittedSessionError) {
            throw submittedSessionError;
          }

          if (submittedSession) {
            return errorJson(
              "ALREADY_SUBMITTED",
              "This exam has already been submitted",
              409
            );
          }

          // 이 경로도 같은 원자 연산을 거친다 (이슈 #84).
          //
          // 제출 시점에 세션이 없으면 여기서 만드는데, 직접 upsert 하면 학생이
          // 입장을 건너뛰고 제출만 보내 발행·학생 한도를 우회할 수 있다.
          // 한도는 한 문(門)으로만 지나가야 한다.
          const { data: admission, error: admitError } = await getSupabase().rpc(
            "admit_exam_session",
            {
              p_exam_id: exam.id,
              p_student_id: verifiedStudentId,
              p_status: "in_progress",
              p_fingerprint: null,
            }
          );

          if (admitError) {
            // fail-open. 한도 계산 장애로 제출이 막히면 그게 더 큰 사고다.
            logError("[feedback] quota_fail_open", admitError, {
              path: "/api/feedback",
              additionalData: { examId: exam.id, reason: "admit_rpc_failed" },
            });
          }

          const verdict = Array.isArray(admission) ? admission[0] : admission;
          if (verdict && verdict.admitted === false) {
            return errorJson(
              verdict.denial_reason === "publish_limit"
                ? "PUBLISH_LIMIT_REACHED"
                : "STUDENT_LIMIT_REACHED",
              "This exam is not accepting new students",
              403
            );
          }

          if (
            exam.is_demo === false &&
            typeof exam.instructor_id === "string"
          ) {
            // UNIQUE(user_id, event)가 동시 입장에서도 최초 발행만 남긴다. 여기서
            // 먼저 조회해 판정하면 경합으로 빠질 수 있고 쿼리만 하나 더 늘어난다.
            await recordOnboardingEvent({
              userId: exam.instructor_id,
              role: "instructor",
              event: ONBOARDING_EVENTS.FIRST_PUBLISH,
              examId: exam.id,
            });
          }

          // RPC 가 세션을 만들었으면 그걸 읽고, 장애로 못 만들었으면(fail-open)
          // 여기서 만든다. 그때 발행 시각도 함께 남긴다 — 안 남기면 그 시험은
          // 장애가 끝난 뒤에도 영영 "미발행"이라 발행 한도가 조용히 샌다.
          if (admitError && (exam as { is_demo?: unknown }).is_demo !== true) {
            const { error: publicationError } = await getSupabase()
              .from("exams")
              .update({ first_published_at: new Date().toISOString() })
              .eq("id", exam.id)
              .is("first_published_at", null);
            if (publicationError) {
              logError("[feedback] quota_fail_open publication", publicationError, {
                path: "/api/feedback",
                additionalData: { examId: exam.id },
              });
            }
          }

          const { data: newSession, error: createError } = await getSupabase()
            .from("sessions")
            .upsert(
              {
                exam_id: exam.id,
                student_id: verifiedStudentId,
              },
              { onConflict: "exam_id,student_id", ignoreDuplicates: true }
            )
            .select()
            .maybeSingle();

          if (createError) {
            throw createError;
          }

          if (newSession) {
            actualSessionId = newSession.id;
          } else {
            // ignoreDuplicates skipped — fetch existing
            const { data: existing, error: fetchError } = await getSupabase()
              .from("sessions")
              .select("id")
              .eq("exam_id", exam.id)
              .eq("student_id", verifiedStudentId)
              .single();
            if (fetchError) throw fetchError;
            actualSessionId = existing.id;
          }
        }
      }

      if (!actualSessionId) {
        throw new Error("Failed to resolve submission session");
      }

      // Cold-start path: if ownedSession was null (no sessionId provided),
      // perform time check on the resolved session to prevent post-deadline submission
      if (!ownedSession && exam.duration !== 0) {
        const { data: resolvedSession } = await getSupabase()
          .from("sessions")
          .select("attempt_timer_started_at, started_at, created_at")
          .eq("id", actualSessionId)
          .single();
        if (resolvedSession) {
          const timerStart = resolvedSession.attempt_timer_started_at
            || resolvedSession.started_at || resolvedSession.created_at;
          const sessionStartTime = new Date(timerStart).getTime();
          const examDurationMs = exam.duration * 60 * 1000;
          const gracePeriodMs = 30 * 1000;
          if (Date.now() > sessionStartTime + examDurationMs + gracePeriodMs) {
            return errorJson("BAD_REQUEST", "시험 시간이 종료되었습니다.", 400);
          }
        }
      }

      const finalSessionId = actualSessionId;

      const submittedAt = new Date().toISOString();

      // ★ 답안 먼저 저장 (세션 상태 변경 전) — 답안 손실 방지
      // Store individual submissions BEFORE marking session as submitted
      const submissionInserts = answers.map(
        (answer: { text?: string } | string, index: number) => {
          const rawAnswerText =
            typeof answer === "string" ? answer : answer.text || "";

          // Preserve rich text HTML — sanitization happens at render time (DOMPurify)
          const answerText = rawAnswerText;

          const submissionData = {
            answer: answerText,
          };

          let compressedSubmissionData;
          let compressionMetadata;

          try {
            const compressed = compressData(submissionData);
            compressedSubmissionData = compressed.data;
            compressionMetadata = compressed.metadata;

            // Validate that compressed data is safe for JSON storage
            JSON.stringify({ compressed_data: compressedSubmissionData });
          } catch {
            // Fallback: store without compression
            compressedSubmissionData = null;
            compressionMetadata = {
              algorithm: "none",
              version: "1.0.0",
              originalSize: JSON.stringify(submissionData).length,
              compressedSize: JSON.stringify(submissionData).length,
              compressionRatio: 1.0,
              timestamp: new Date().toISOString(),
            };
          }

          return {
            session_id: finalSessionId,
            q_idx: index,
            answer: answerText,
            compressed_answer_data: compressedSubmissionData,
            compression_metadata: compressionMetadata,
          };
        }
      );

      const { error: submissionsError } = await getSupabase()
        .from("submissions")
        .upsert(submissionInserts, { onConflict: "session_id,q_idx" })
        .select();

      if (submissionsError) {
        throw new Error(
          `Database insert failed: ${submissionsError.message} (Code: ${submissionsError.code})`
        );
      }

      // Server-side chat history: query messages table instead of trusting client data
      // (same pattern as app/api/exam/[examId]/end/route.ts force-end)
      const { data: serverMessages } = await getSupabase()
        .from("messages")
        .select("q_idx, role, content, created_at")
        .eq("session_id", finalSessionId)
        .order("created_at", { ascending: true });

      const sessionData = {
        chatHistory: (serverMessages || []).map((m) => ({
          type: m.role === "user" ? "student" : "ai",
          content: m.content,
          timestamp: m.created_at,
        })),
        answers: answers,
      };

      const compressedSessionData = compressData(sessionData);

      // ★ 세션 상태 변경은 답안 저장 성공 후에만 수행
      // Guard: only update if not already submitted (prevents duplicate submissions)
      const { data: updatedSession, error: updateSessionError } = await getSupabase()
        .from("sessions")
        .update({
          compressed_session_data: compressedSessionData.data,
          compression_metadata: compressedSessionData.metadata,
          submitted_at: submittedAt,
          status: "submitted",
          is_active: false,
        })
        .eq("id", finalSessionId)
        .eq("student_id", verifiedStudentId)
        .eq("exam_id", exam.id)
        .is("submitted_at", null)
        .select("id")
        .maybeSingle();

      if (!updatedSession && !updateSessionError) {
        return errorJson("ALREADY_SUBMITTED", "This session has already been submitted", 409);
      }

      // Atomic student_count increment (race-safe via RPC)
      //
      // 교수자가 자기 데모를 학생 시점으로 겪는 경우는 세지 않는다(#167).
      // 안 그러면 데모 상세에 교수자 자신이 학생 1명으로 잡히고, 데모의
      // student_count 가 올라간다 — 데모는 목록·통계·한도 어디에도 나타나면
      // 안 된다는 AC-17 과 정면으로 어긋난다.
      //
      // 판정 불능(null)이면 세지 않는다. "일반 학생"으로 단정하는 순간 오염이
      // 다시 시작되고, 이 카운터는 #84 의 학생 5명 상한이 읽는 값이다.
      const preview = isDemoPreview({
        isDemo: (exam as { is_demo?: unknown }).is_demo,
        instructorId: (exam as { instructor_id?: unknown }).instructor_id,
        userId: verifiedStudentId,
      });

      if (preview === true) {
        await recordOnboardingEvent({
          userId: verifiedStudentId,
          role: "instructor",
          event: ONBOARDING_EVENTS.DEMO_ANSWERED,
          examId: exam.id,
        });
      } else if (preview === false && typeof exam.instructor_id === "string") {
        await recordOnboardingEvent({
          userId: exam.instructor_id,
          role: "instructor",
          event: ONBOARDING_EVENTS.FIRST_STUDENT_SUBMISSION,
          examId: exam.id,
        });
      }

      if (preview === false) {
        const { error: rpcError } = await getSupabase().rpc(
          "increment_student_count",
          { p_exam_id: exam.id }
        );
        if (rpcError) {
          logError("Failed to increment student_count via RPC", rpcError, {
            path: "/api/feedback",
            additionalData: { examId: exam.id },
          });
        }
      }

      await triggerGradingIfNeeded(finalSessionId, "feedback");
    } catch (error) {
      logError("Failed to store submission in database", error, {
        path: "/api/feedback",
      });
      return errorJson(
        "INTERNAL_ERROR",
        "Failed to store submission in database",
        500
      );
    }

    // Audit log: session submit via feedback
    if (actualSessionId) {
      auditLog({
        action: "session_submit",
        userId: user.id,
        targetId: actualSessionId,
        details: { examId: exam.id, examCode },
      }).then((ok) => {
        if (!ok) {
          logError("[feedback] Audit log failed for session_submit", new Error("auditLog returned false"), {
            path: "/api/feedback",
            additionalData: { sessionId: actualSessionId, examId: exam.id },
          });
        }
      });
    }

    return successJson({
      timestamp: new Date().toISOString(),
      examCode,
      examId: exam.id,
      status: "submitted",
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
