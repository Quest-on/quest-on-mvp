import { NextResponse } from "next/server";
import { evaluateConsentGate } from "@/lib/consent-gate";
import { getConsentGateMode, modeBlocksApis, modeLogsOnly } from "@/lib/consent-gate-mode";
import { logInfo } from "@/lib/logger";
import { getSupabaseServer } from "@/lib/supabase-server";

export type ConsentRouteClass = "public" | "onboarding_support" | "exam_continuity" | "protected";

const ONBOARDING_SUPPORT = new Set([
  "GET /api/consents/onboarding",
  "POST /api/consents/onboarding",
  "PATCH /api/user/profile",
  "GET /api/student/profile",
  "POST /api/student/profile",
  "GET /api/instructor/profile",
  "POST /api/instructor/profile",
  "GET /api/universities/search",
  "POST /api/auth/revoke-other-sessions",
]);

export const SUPA_CONTINUITY_ACTIONS = new Set([
  "init_exam_session",
  "create_or_get_session",
  "save_draft",
  "save_all_drafts",
  "save_draft_answers",
  "get_session_submissions",
  "get_session_messages",
  "session_heartbeat",
  "deactivate_session",
  "check_exam_gate_status",
  "submit_exam",
  "save_canvas",
  "save_final_answer",
  "submit_assignment",
]);

const PUBLIC_PREFIXES = ["/legal/", "/auth/callback", "/sign-in", "/sign-up", "/sso", "/join", "/onboarding", "/student/profile-setup", "/instructor-pending"];
const INTERNAL_PREFIXES = ["/api/admin/", "/api/internal/", "/api/cron/", "/api/health"];

export function classifyRoute(pathname: string, method: string, action?: unknown): ConsentRouteClass {
  const key = `${method.toUpperCase()} ${pathname}`;
  if (ONBOARDING_SUPPORT.has(key)) return "onboarding_support";
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))) return "public";
  if (INTERNAL_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))) return "public";
  if (method.toUpperCase() === "GET" && (/^\/exam\/[^/]+$/.test(pathname) || /^\/assignment\/[^/]+$/.test(pathname))) return "exam_continuity";
  if (method.toUpperCase() === "POST" && pathname === "/api/supa" && typeof action === "string" && SUPA_CONTINUITY_ACTIONS.has(action)) return "exam_continuity";
  if (method.toUpperCase() === "POST" && ["/api/chat", "/api/assignment-chat", "/api/log/paste", "/api/feedback"].includes(pathname)) return "exam_continuity";
  if (method.toUpperCase() === "POST" && /^\/api\/student\/session\/[^/]+\/deadline-auto-submit$/.test(pathname)) return "exam_continuity";
  if (method.toUpperCase() === "GET" && /^\/api\/session\/[^/]+$/.test(pathname)) return "exam_continuity";
  return "protected";
}

function requestSessionId(pathname: string, body: Record<string, unknown> | undefined): string | null {
  const pathMatch = pathname.match(/^\/api\/(?:student\/)?session\/([^/]+)/);
  if (pathMatch) return pathMatch[1];
  return typeof body?.sessionId === "string" ? body.sessionId : null;
}

function requestExamCode(pathname: string, body: Record<string, unknown> | undefined): string | null {
  const pathMatch = pathname.match(/^\/(?:exam|assignment)\/([^/]+)$/);
  if (pathMatch) return pathMatch[1];
  return typeof body?.examCode === "string" ? body.examCode : null;
}

export async function ownsInProgressSession(
  userId: string,
  pathname: string,
  body?: Record<string, unknown>
): Promise<boolean> {
  const sessionId = requestSessionId(pathname, body);
  const examCode = requestExamCode(pathname, body);
  const examId = typeof body?.examId === "string" ? body.examId : null;
  if (!sessionId && !examCode && !examId) return false;

  let query = getSupabaseServer()
    .from("sessions")
    .select("id, exam_id, exams!inner(code)")
    .eq("student_id", userId)
    .eq("status", "in_progress");
  if (sessionId) query = query.eq("id", sessionId);
  if (examId) query = query.eq("exam_id", examId);
  if (examCode) query = query.eq("exams.code", examCode);
  const { data, error } = await query.maybeSingle();
  return !error && !!data;
}

/**
 * Reusable consent guard. It is deliberately applied only to /api/supa in this PR;
 * other protected API routes remain unchanged to avoid a broad routing blast radius.
 */
export async function assertConsentOrRespond(
  userId: string,
  pathname: string,
  method: string,
  body?: Record<string, unknown>
): Promise<NextResponse | null> {
  const action = body?.action;
  const routeClass = classifyRoute(pathname, method, action);
  const mode = getConsentGateMode();
  if (routeClass === "public" || routeClass === "onboarding_support" || mode === "off") return null;

  const gate = await evaluateConsentGate(userId);
  let decision = "allow";
  if (!gate.complete && routeClass === "exam_continuity") {
    const owned = await ownsInProgressSession(userId, pathname, body);
    if (owned) decision = "allow_continuity";
    else if (modeBlocksApis(mode)) decision = "block";
  } else if (!gate.complete && modeBlocksApis(mode)) {
    decision = "block";
  }

  if (modeLogsOnly(mode) || !gate.complete) {
    void logInfo("consent_gate", { payload: { mode, route_class: routeClass, method: method.toUpperCase(), decision, reason: gate.complete ? "complete" : gate.reason } });
  }
  if (decision === "block") {
    return NextResponse.json({ error: "CONSENT_REQUIRED", redirect: "/onboarding" }, { status: 428 });
  }
  return null;
}
