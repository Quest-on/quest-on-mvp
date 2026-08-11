import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import {
  ONBOARDING_ROLE_COOKIE,
  isSignupRole,
  readRoleCookie,
  type SignupRole,
} from "@/lib/onboarding-role";

/**
 * POST /api/user/role — 역할 **최초 1회** 클레임 (이슈 #87 / AC-20, AC-21).
 *
 * 왜 별도 라우트인가: `PATCH /api/user/profile` 이 `role`·`status` 를 클라이언트에서
 * 받아 service_role 로 썼다. 즉 로그인한 아무나 `{"role":"instructor","status":"approved"}`
 * 를 보내면 승인된 교수자가 됐고, 관리자 승인 게이트도 #84 의 발행 한도도 같은
 * 방법으로 우회됐다. 프로필 편집(이름·소속)과 인가 사실(역할)은 수명이 다르다 —
 * 편집은 몇 번이든, 클레임은 딱 한 번이다.
 *
 * 원자성(AC-21): 읽고→비었으면→쓰기는 TOCTOU 다. 두 요청이 동시에 통과해 나중
 * 것이 이긴다. 그래서 `.is("role", null)` 을 **업데이트 술어**에 넣어 DB 가 한 번만
 * 성공시키게 한다. 영향받은 행이 0이면 이미 정해진 것이다.
 *
 * `status` 는 클라이언트가 못 정한다. `plan` 은 아예 손대지 않는다(기본 `free`).
 * 둘을 올리는 건 관리자 엔드포인트뿐이다.
 */
/**
 * 역할별 초기 `status`.
 *
 * 교수자도 `approved` 다. 예전에는 `pending` 으로 두고 미들웨어가 교수자를
 * `/instructor-pending` 으로 돌려보냈는데, 그러면 에픽 #79 의 목표("관리자 승인을
 * 기다리지 않고 가입 직후 자기 과목 데모를 겪는다")가 런타임에서 정확히 반대로
 * 동작한다. 데모 생성·완주·미리보기를 다 만들어 놓고 진입을 막고 있었다.
 *
 * 승인은 차단이 아니라 **`profiles.plan` 승격**이다(ADR-006). 미인증 계정을
 * 제어하는 건 `status` 가 아니라 무료 한도이고, 그 값은 `plan_limits` 가 정한다.
 */
const ROLE_STATUS: Record<SignupRole, "approved"> = {
  instructor: "approved",
  student: "approved",
};

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(
      `user-role-claim:${user.id}`,
      RATE_LIMITS.sessionRead
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests.", 429);
    }

    // 본문의 역할은 "방금 화면에서 고른 값"이고, 쿠키는 "가입할 때 고르려던 값"이라
    // 더 오래됐다. 둘 다 클라이언트가 영향을 주지만 여기서 정해지는 건
    // instructor/student 뿐이고 status 는 서버가 강제하므로, 신선한 쪽을 먼저 본다.
    let bodyRole: unknown;
    try {
      const body = await request.json();
      bodyRole = (body as { role?: unknown } | null)?.role;
    } catch {
      // 본문 없이 부르는 것도 유효하다 — 쿠키로 해석한다.
    }

    // OAuth 가입은 `signInWithOAuth` 가 metadata 를 못 실어서, 가입 폼이 단명
    // 쿠키에 의도를 남긴다. 그 쿠키를 읽는 쪽이 여기다.
    const role = isSignupRole(bodyRole)
      ? bodyRole
      : readRoleCookie(request.headers.get("cookie"));

    if (!role) {
      return errorJson("INVALID_INPUT", "Role is required", 400);
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("profiles")
      .update({
        role,
        status: ROLE_STATUS[role],
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .is("role", null)
      .select("role, status");

    if (error) {
      logError("[user-role] Failed to claim role", error, {
        path: "/api/user/role",
      });
      return errorJson("UPDATE_FAILED", "Failed to claim role", 500);
    }

    if (!data || data.length === 0) {
      // 이미 정해졌거나(재요청·동시요청 패배) 프로필 행이 없다. 어느 쪽이든 여기서
      // 역할을 바꿔주지 않는다 — 그게 이 이슈의 취약점이었다.
      const { data: existing } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!existing) {
        return errorJson("NOT_FOUND", "Profile not found", 404);
      }

      return errorJson(
        "ROLE_ALREADY_SET",
        "Role is already assigned and cannot be changed.",
        409,
        { role: existing.role }
      );
    }

    const response = successJson({ role: data[0].role, status: data[0].status });
    // 의도 쿠키는 소비되면 남길 이유가 없다.
    response.cookies.set(ONBOARDING_ROLE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    logError("[user-role] Unhandled error", error, { path: "/api/user/role" });
    return errorJson("UPDATE_FAILED", "Failed to claim role", 500);
  }
}
