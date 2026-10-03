import { NextResponse } from "next/server";
import { evaluateConsentGate } from "@/lib/consent-gate";
import { getConsentGateMode, modeBlocksApis, modeLogsOnly } from "@/lib/consent-gate-mode";
import { logError, logInfo } from "@/lib/logger";
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

// 비밀번호 복구 경로(#318)는 동의 게이트 앞에 선다.
//
// 복구 링크 확인(`/auth/recovery` → verify)이 세션을 만들고 `/reset-password`
// 로 보내는데, 그 경로가 여기서 "protected" 로 분류되면 필수 동의가 남은
// 사용자는 프록시가 `/onboarding` 으로 돌려보낸다. 그러면 비밀번호를 바꾸기
// 전에 동의 화면에 갇히고, 거기서 탭을 닫으면 **로그인은 된 채 잊어버린
// 비밀번호는 그대로** 남는다.
// 트레일링 슬래시를 붙인 건 `/legal/` 과 같은 이유다. 매칭이
// `pathname === prefix.slice(0,-1) || pathname.startsWith(prefix)` 이라
// 슬래시 없이 `"/reset-password"` 로 넣으면 `/reset-password-extra` 같은
// 남의 경로까지 public 이 된다. 동의 게이트를 여는 구멍은 좁아야 한다.
const PUBLIC_PREFIXES = ["/legal/", "/auth/callback", "/sign-in", "/sign-up", "/sso", "/join", "/onboarding", "/student/profile-setup", "/instructor-pending", "/forgot-password/", "/reset-password/", "/auth/recovery/"];

// 복구의 두 쓰기 요청도 같은 이유로 게이트 앞에 선다. 복구 세션의 주인이
// 동의 미완료면 `enforce` 에서 428 이 나 비밀번호를 못 바꾼다.
// 접두어가 아니라 메서드·경로 정확 일치로 좁힌다.
const RECOVERY_API = new Set([
  "POST /api/auth/password-reset/verify",
  "POST /api/auth/password-reset/complete",
]);
const INTERNAL_PREFIXES = ["/api/admin/", "/api/internal/", "/api/cron/", "/api/health"];

export function classifyRoute(pathname: string, method: string, action?: unknown): ConsentRouteClass {
  const key = `${method.toUpperCase()} ${pathname}`;
  if (ONBOARDING_SUPPORT.has(key)) return "onboarding_support";
  if (RECOVERY_API.has(key)) return "public";
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))) return "public";
  if (INTERNAL_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))) return "public";
  if (method.toUpperCase() === "GET" && (/^\/exam\/[^/]+$/.test(pathname) || /^\/assignment\/[^/]+$/.test(pathname))) return "exam_continuity";
  if (method.toUpperCase() === "POST" && pathname === "/api/supa" && typeof action === "string" && SUPA_CONTINUITY_ACTIONS.has(action)) return "exam_continuity";
  if (method.toUpperCase() === "POST" && ["/api/chat", "/api/chat/analysis", "/api/assignment-chat", "/api/log/paste", "/api/feedback"].includes(pathname)) return "exam_continuity";
  if (method.toUpperCase() === "POST" && /^\/api\/student\/session\/[^/]+\/deadline-auto-submit$/.test(pathname)) return "exam_continuity";
  if (method.toUpperCase() === "GET" && /^\/api\/session\/[^/]+$/.test(pathname)) return "exam_continuity";
  // 분석 턴 기록과 그림(#545). 시험 중인 학생이 자기 대화의 그림을 연다. 소유권과 교수 접근은 라우트가 확인하고,
  // 라우트가 이 분류로 동의 판정(`assertConsentOrRespond`)을 다시 한다.
  if (method.toUpperCase() === "GET" && /^\/api\/session\/[^/]+\/analysis(?:\/figures\/[^/]+\/[^/]+)?$/.test(pathname)) return "exam_continuity";
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

/**
 * 요청이 가리키는 시험에 이 사용자의 진행 중(in_progress) 세션이 있는지 본다. 동의를 마치지
 * 못한 사용자에게 시험 연속성 예외를 줄지 정하는 판정이다.
 *
 * 판정은 `sessions.exam_id` 와 `exams.id` 를 서로 다른 조회로 읽어 맞춘다. 예전에는
 * `sessions` 에서 `exams!inner(code)` 를 임베드했는데, PostgREST 임베드는 DB 에
 * `sessions.exam_id → exams.id` 외래키가 있어야만 동작한다. 스테이징·운영 DB 에는 그 FK 가
 * 없어서 조회가 언제나 `PGRST200` 으로 실패했고, 함수가 항상 false 라 동의 미완료 학생이
 * 진행 중인 시험에서도 막혔다. (#531, 같은 뿌리: #525. FK 복구는 #526)
 *
 * 결과가 true 인 조건은 임베드 시절과 같다: 같은 학생의 in_progress 세션이 요청의 sessionId,
 * examId, 시험 코드(examCode)와 모두 맞고, 그 세션의 시험 행이 실제로 있다(inner join).
 * 조회가 실패하거나 행이 둘 이상이면 false 다. 연속성 예외를 못 받는 쪽이 안전한 쪽이라
 * (fail-closed) 오류를 true 로 읽지 않는다.
 */
export async function ownsInProgressSession(
  userId: string,
  pathname: string,
  body?: Record<string, unknown>
): Promise<boolean> {
  const sessionId = requestSessionId(pathname, body);
  const examCode = requestExamCode(pathname, body);
  const examId = typeof body?.examId === "string" ? body.examId : null;
  if (!sessionId && !examCode && !examId) return false;

  const supabase = getSupabaseServer();

  // 시험 코드는 먼저 시험 id 로 바꾼다. 세션을 먼저 읽고 코드를 나중에 대조하면, 다른 시험에도
  // 진행 중인 세션이 있는 학생에서 `maybeSingle` 이 다중 행 오류를 내 false 가 된다. 기존
  // 필터(`exams.code`)는 코드의 시험으로 좁혀 읽었다. 코드 유니크가 DB 에 없어도 같은 결과가
  // 되도록 id 를 목록으로 받는다.
  let codeExamIds: string[] | null = null;
  if (examCode) {
    const { data, error } = await supabase.from("exams").select("id").eq("code", examCode);
    if (error) return lookupFailed("exams", error, userId);
    if (!data || data.length === 0) return false;
    codeExamIds = data.map((exam: { id: string }) => exam.id);
  }

  let query = supabase
    .from("sessions")
    .select("id, exam_id")
    .eq("student_id", userId)
    .eq("status", "in_progress");
  if (sessionId) query = query.eq("id", sessionId);
  if (examId) query = query.eq("exam_id", examId);
  if (codeExamIds) query = query.in("exam_id", codeExamIds);
  const { data: session, error: sessionError } = await query.maybeSingle();
  if (sessionError) return lookupFailed("sessions", sessionError, userId);
  if (!session) return false;
  if (codeExamIds) return true;

  // 시험 코드로 좁히지 않았으면 세션의 시험 행이 실제로 있는지 따로 확인한다. 임베드의 inner
  // join 은 시험이 없는 세션을 걸러 냈고, FK 가 없는 DB 에서는 시험이 지워진 세션이 남을 수 있다.
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id")
    .eq("id", session.exam_id)
    .maybeSingle();
  if (examError) return lookupFailed("exams", examError, userId);
  return !!exam;
}

/**
 * 조회 오류를 남기고 연속성 예외를 주지 않는다(false). 예전에는 오류와 행 없음이 둘 다 조용한
 * false 라 FK 부재로 모든 조회가 실패해도 아무 흔적이 없었다.
 *
 * `22P02` 는 uuid 컬럼에 uuid 모양이 아닌 값을 건 조회다. sessionId·examId 가 클라이언트 입력이고
 * 동의 판정이 입력 검증보다 앞서므로, 잘못된 값을 보내 오류 로그를 채울 수 있다. 행 없음과
 * 같게 다룬다.
 */
function lookupFailed(table: string, error: { code?: string }, userId: string): false {
  if (error.code !== "22P02") {
    void logError(`[consent] in_progress session ownership lookup failed (${table})`, error, {
      path: "lib/consent-route-policy",
      user_id: userId,
    });
  }
  return false;
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
