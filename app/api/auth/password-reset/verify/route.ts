import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { errorJson } from "@/lib/api-response";
import { logError, logWarn } from "@/lib/logger";
import { isSameOriginRequest } from "@/lib/same-origin";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";
import { isPasswordResetEnabled } from "@/lib/password-reset-availability";
import {
  PASSWORD_RESET_PATH,
  PASSWORD_RESET_RECOVERY_PATH,
  RECOVERY_TOKEN_HASH_PATTERN,
  bindingFromClaims,
  decodeTrustedAccessToken,
  issuePasswordResetIntent,
  passwordResetIntentCookie,
} from "@/lib/password-reset-intent";

/**
 * POST /api/auth/password-reset/verify
 *
 * 복구 링크 확인 (이슈 #318). `/auth/recovery` 의 버튼이 보내는 폼 요청이다.
 *
 * 메일의 `token_hash` 를 서버가 `verifyOtp({ type: "recovery" })` 로 확인하고,
 * 성공하면 그 응답의 세션 — **정의상 복구 세션** — 에 묶인 의도 쿠키를 심은 뒤
 * `/reset-password` 로 보낸다. 판단 근거는 `lib/password-reset-intent.ts` 참고.
 *
 * ## 왜 GET 이 아니라 POST 인가
 *
 * 메일 보안 스캐너(Outlook Safe Links 등)는 링크를 **미리 열어 본다.** 링크가
 * 곧바로 토큰을 쓰면 사람이 누르기 전에 1회용 토큰이 타 버린다. 스캐너는
 * 버튼을 누르지 않는다.
 *
 * ## 왜 같은 출처만 받는가
 *
 * 다른 사이트가 자기 `token_hash` 로 이 폼을 자동 제출하면, 피해자 브라우저에
 * **공격자 계정의 세션**이 심긴다(로그인 CSRF). 그 뒤 피해자가 입력하는 것은
 * 공격자 계정으로 간다.
 *
 * 응답은 전부 303 이다. 폼 제출이라 JSON 을 받아 줄 스크립트가 없다.
 */

const VerifySchema = z.object({
  // GoTrue 의 TokenHash 는 16진 문자열이다. 넉넉히 잡되 모양은 좁힌다.
  token_hash: z.string().regex(RECOVERY_TOKEN_HASH_PATTERN),
  type: z.literal("recovery"),
});

const PATH = "/api/auth/password-reset/verify";

function seeOther(request: NextRequest, pathname: string, params?: Record<string, string>) {
  const url = new URL(pathname, request.url);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

function invalidLink(request: NextRequest) {
  return seeOther(request, PASSWORD_RESET_RECOVERY_PATH, { error: "invalid_link" });
}

export async function POST(request: NextRequest) {
  if (!isPasswordResetEnabled()) {
    return errorJson("NOT_FOUND", "Not found", 404);
  }

  // 다른 사이트에서 시작된 요청이면 아무것도 하지 않는다. 폼이 아니라 공격
  // 페이지가 보낸 것이므로 안내 화면으로 보낼 이유도 없다.
  if (!isSameOriginRequest(request)) {
    return errorJson("FORBIDDEN", "Cross-origin request", 403);
  }

  const rl = await checkRateLimitAsync(
    `password-reset-verify:ip:${clientIp(request)}`,
    RATE_LIMITS.passwordResetVerify
  );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalidLink(request);
  }
  const parsed = VerifySchema.safeParse({
    token_hash: form.get("token_hash"),
    type: form.get("type"),
  });
  if (!parsed.success) return invalidLink(request);

  if (!rl.allowed) {
    // 토큰을 쓰지 않았으니 같은 링크로 다시 시도할 수 있게 되돌려 보낸다.
    return seeOther(request, PASSWORD_RESET_RECOVERY_PATH, {
      token_hash: parsed.data.token_hash,
      type: "recovery",
      error: "rate_limited",
    });
  }

  try {
    const supabase = await getSupabaseAuthClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: parsed.data.token_hash,
      type: "recovery",
    });

    if (error || !data.session) {
      // 만료·재사용·다른 메일에 밀려 무효가 된 링크가 전부 여기로 온다.
      // 흔한 일이라 경고로만 남긴다.
      void logWarn("[password-reset] verify_failed", {
        path: PATH,
        payload: { status: error?.status ?? null, code: error?.code ?? null },
      });
      return invalidLink(request);
    }

    // Supabase 가 방금 직접 준 토큰이다 — 서명을 다시 볼 필요가 없다.
    const binding = bindingFromClaims(
      decodeTrustedAccessToken(data.session.access_token)
    );
    const intent = binding ? issuePasswordResetIntent(binding) : null;
    if (!intent) {
      // 세션은 생겼는데 이 세션으로 비밀번호를 바꿀 수 없다. 로그인만 된 채
      // 남겨 두면 복구 링크가 "비밀번호 없는 로그인" 이 된다 — 거둔다.
      logError(
        "[password-reset] intent_issue_failed",
        new Error(binding ? "intent key unavailable" : "session claims missing"),
        { path: PATH, user_id: data.user?.id }
      );
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return invalidLink(request);
    }

    const cookie = passwordResetIntentCookie(
      intent,
      new URL(request.url).protocol === "https:"
    );
    (await cookies()).set(cookie.name, cookie.value, cookie.options);
    return seeOther(request, PASSWORD_RESET_PATH);
  } catch (error) {
    logError("[password-reset] verify_error", error, { path: PATH });
    return invalidLink(request);
  }
}
