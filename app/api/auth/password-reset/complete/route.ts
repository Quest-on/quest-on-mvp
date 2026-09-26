import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { logError, logWarn } from "@/lib/logger";
import { isSameOriginRequest } from "@/lib/same-origin";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";
import { isPasswordResetEnabled } from "@/lib/password-reset-availability";
import { validatePasswordPair } from "@/lib/password-policy";
import {
  PASSWORD_RESET_COOKIE,
  bindingFromClaims,
  clearPasswordResetIntentCookie,
  matchesPasswordResetBinding,
  readPasswordResetIntent,
} from "@/lib/password-reset-intent";

/**
 * POST /api/auth/password-reset/complete
 *
 * 새 비밀번호 저장 (이슈 #318). `/reset-password` 화면이 부른다.
 *
 * 예전에는 화면이 브라우저에서 `updateUser` 를 직접 불렀다. 그러면 "이 세션이
 * 복구로 만들어졌는가" 를 판단하는 곳이 화면뿐이고, 로그인한 사람은 화면을
 * 거치지 않고 같은 호출을 할 수 있었다. 판단과 변경을 **한 요청 안에** 둔다.
 *
 *   1. 검증된 세션(`getClaims`)이 의도 쿠키에 적힌 `(user_id, session_id)` 와
 *      같아야 한다 — 복구 링크로 만들어진 바로 그 세션만.
 *   2. 비밀번호를 바꾼다.
 *   3. **이 세션을 포함한 모든 세션을 끊고** 의도 쿠키를 지운다. 비밀번호를
 *      잊었다는 건 남이 알고 있었을 가능성을 포함하고, 복구 세션이 살아
 *      있으면 링크 한 번이 "비밀번호 없는 로그인" 으로 남는다. 사용자는 새
 *      비밀번호로 다시 로그인한다 — 방금 정한 값을 기억하는지도 거기서 확인된다.
 */

const CompleteSchema = z.object({
  // 화면과 같은 규칙 — 하한은 앱 정책, 상한은 Supabase 가 보는 72 **바이트**.
  // 글자 수로 재면 한글 25자가 여기를 지나 Supabase 에서 400 으로 거절된다.
  password: z.string().refine((p) => validatePasswordPair(p, p) === null),
});

const PATH = "/api/auth/password-reset/complete";

export async function POST(request: NextRequest) {
  if (!isPasswordResetEnabled()) {
    return errorJson("NOT_FOUND", "Not found", 404);
  }

  if (!isSameOriginRequest(request)) {
    return errorJson("FORBIDDEN", "Cross-origin request", 403);
  }

  const rl = await checkRateLimitAsync(
    `password-reset-complete:ip:${clientIp(request)}`,
    RATE_LIMITS.passwordResetVerify
  );
  if (!rl.allowed) {
    return errorJson("RATE_LIMITED", "Too many requests", 429);
  }

  const secure = new URL(request.url).protocol === "https:";
  const cookieStore = await cookies();

  try {
    const supabase = await getSupabaseAuthClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const current = bindingFromClaims(claimsData?.claims);
    if (!current) {
      return errorJson("UNAUTHORIZED", "Recovery session required", 401);
    }

    const intent = readPasswordResetIntent(
      cookieStore.get(PASSWORD_RESET_COOKIE)?.value
    );
    if (!matchesPasswordResetBinding(intent, current)) {
      return errorJson("INTENT_INVALID", "Recovery link required", 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }
    const parsed = CompleteSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (updateError) {
      // 서버 원문은 영문 개발자용이라 코드로만 돌려준다. 화면이 문구를 고른다.
      if (updateError.code === "same_password") {
        return errorJson("SAME_PASSWORD", "Same as current password", 400);
      }
      if (updateError.code === "weak_password") {
        return errorJson("WEAK_PASSWORD", "Password too weak", 400);
      }
      logError("[password-reset] update_failed", updateError, {
        path: PATH,
        additionalData: {
          status: updateError.status ?? null,
          code: updateError.code ?? null,
        },
      });
      return errorJson("UPDATE_FAILED", "Password update failed", 500);
    }

    // 여기부터는 되돌릴 수 없는 작업 뒤의 정리다. 실패해도 비밀번호는 이미
    // 바뀌었으므로 성공으로 답하고, 끊기지 않았다는 사실만 알린다.
    let revoked = false;
    try {
      const { error: signOutError } = await supabase.auth.signOut({
        scope: "global",
      });
      revoked = !signOutError;
      if (signOutError) {
        void logWarn("[password-reset] global_signout_failed", {
          path: PATH,
          user_id: current.userId,
          payload: {
            status: signOutError.status ?? null,
            code: signOutError.code ?? null,
          },
        });
      }
    } catch (error) {
      logError("[password-reset] global_signout_error", error, {
        path: PATH,
        additionalData: { userId: current.userId },
      });
    }

    const cleared = clearPasswordResetIntentCookie(secure);
    cookieStore.set(cleared.name, cleared.value, cleared.options);
    return successJson({ revoked });
  } catch (error) {
    logError("[password-reset] complete_error", error, { path: PATH });
    return errorJson("UPDATE_FAILED", "Password update failed", 500);
  }
}
