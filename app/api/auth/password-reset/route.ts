import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { logError } from "@/lib/logger";

/**
 * POST /api/auth/password-reset
 *
 * 비밀번호 재설정 메일 발송 요청 (이슈 #318).
 *
 * ## 왜 SDK 를 쓰는가 — 손으로 말았다가 기능이 통째로 죽었다
 *
 * 처음엔 `/auth/v1/recover` 를 raw fetch 로 직접 불렀다. 그러면 **발송은
 * 성공하는데 링크가 전부 실패한다.** GoTrue 는 요청에 `code_challenge` 가
 * 있는지로 플로우를 고르고, 없으면 implicit flow 를 쓴다. 그 링크는 토큰을
 * **URL 프래그먼트**로 실어 보낸다.
 *
 *   /auth/callback?next=/reset-password#access_token=…&refresh_token=…
 *
 * `app/auth/callback/route.ts` 는 서버 라우트다. **브라우저는 프래그먼트를
 * 서버로 보내지 않는다.** `searchParams.get("code")` 는 영원히 null 이고
 * 모든 재설정 링크가 `/sign-in?error=auth_callback_failed` 로 끝났다.
 *
 * SDK 를 쓰면 PKCE challenge 를 만들고 verifier 를 쿠키 어댑터로 저장한다.
 * 그 쿠키가 이 응답의 Set-Cookie 로 브라우저에 심기고, 콜백의
 * `createServerClient` 가 그걸 읽어 `exchangeCodeForSession(code)` 를 끝낸다.
 * 이 저장소에서 동작하는 다른 인증 경로(CustomSignIn·CustomSignUp)가 전부
 * SDK 를 쓰는 이유다.
 *
 * ## 왜 클라이언트가 아니라 이 라우트를 거치는가
 *
 * 1. 레이트리밋. `lib/rate-limit.ts` 는 서버에만 있다. 재설정 발송은 로그인
 *    없이 부를 수 있는 몇 안 되는 쓰기 동작이라, 남의 받은편지함에 메일을
 *    넣는 통로가 된다. Supabase 자체 한도는 프로젝트 전역이라 한 명이
 *    소진하면 **모든 사용자의 재설정이 막힌다.**
 * 2. 응답 통일. 아래 참고.
 *
 * ## 이메일 존재 여부를 흘리지 않는다
 *
 * 가입된 주소와 아닌 주소의 응답이 다르면, 이 엔드포인트는 계정 존재 여부를
 * 확인해 주는 도구가 된다. 교수자 명단은 대학 홈페이지에 공개돼 있어 대조가
 * 쉽다. 성공·미가입·업스트림 오류를 구분하지 않고 전부 같은 200 을 준다.
 *
 * 레이트리밋 초과(429)만 예외다. "이 IP 가 너무 많이 눌렀다" 는 계정 존재
 * 여부와 무관하고, 안 알려주면 사용자가 계속 누른다.
 */

const PasswordResetSchema = z.object({
  email: z.string().trim().email().max(320),
});

/** 실패해도 사용자에게는 성공과 같은 응답을 준다. */
const GENERIC_OK = { sent: true } as const;

/**
 * 클라이언트 IP. 프록시가 하나만 채워 주는 경우가 있어 순서대로 본다.
 *
 * 전부 비면 `unknown` 하나로 모이는데, 이 버킷은 5분 3회라 그 상태에서는
 * **한 사람의 재시도가 전체를 잠근다.** 그래서 마지막 수단으로만 쓴다.
 */
function clientIp(request: NextRequest): string {
  const candidates = [
    request.headers.get("x-forwarded-for")?.split(",")[0],
    request.headers.get("x-real-ip"),
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0],
  ];
  for (const c of candidates) {
    const v = c?.trim();
    if (v) return v;
  }
  return "unknown";
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      // 본문이 JSON 이 아니면 파싱도 안 된 요청이다. 계정 열거를 막는 이유는
      // "유효한 요청인데 주소가 없을 때" 에만 적용된다 — 여기서 200 을 주면
      // 화면이 "메일을 보냈습니다" 라고 말한다.
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }

    const parsed = PasswordResetSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }

    // 키를 IP + 주소로 나눈다 (리뷰 지적).
    //
    // IP 단독이면 **대학 NAT 환경에서 4번째 사람이 잠긴다.** 이 제품 사용자가
    // 정확히 그 환경이다 — 한 기관이 하나의 출구 IP 를 쓴다. 반대로 IP 만 보면
    // 공격자가 IP 를 돌려 한 주소에 무제한으로 메일을 넣을 수 있다.
    //
    // 그래서 둘 다 건다. 주소 쪽이 "남의 받은편지함" 을 지키고, IP 쪽이
    // 무작위 주소 대량 시도를 지킨다. 주소는 해시해서 키에만 쓴다 — 레이트리밋
    // 저장소에 평문 이메일을 남기지 않는다.
    const email = parsed.data.email.toLowerCase();
    const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 32);

    for (const key of [
      `password-reset:ip:${clientIp(request)}`,
      `password-reset:addr:${emailKey}`,
    ]) {
      const rl = await checkRateLimitAsync(key, RATE_LIMITS.passwordReset);
      if (!rl.allowed) {
        return errorJson("RATE_LIMITED", "Too many requests", 429);
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      logError(
        "[password-reset] supabase env missing",
        new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY absent"),
        { path: "/api/auth/password-reset" }
      );
      return successJson(GENERIC_OK);
    }

    // PKCE verifier 는 이 응답의 쿠키로 나가야 콜백이 읽을 수 있다.
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    });

    // 재설정 링크가 돌아올 곳. `next` 는 콜백이 세션 교환 뒤 보낼 내부 경로다.
    //
    // 허용목록에 없으면 Supabase 가 조용히 Site URL 로 갈아끼운다 — 그러면
    // 사용자는 로그인만 된 채 홈에 떨어지고 비밀번호는 그대로다. 허용목록의
    // `/auth/callback` 에 쿼리스트링이 보존되는 것은 staging 에서 확인했다(#193).
    const redirectTo = new URL(
      getAuthCallbackUrl(new URL(request.url).origin)
    );
    redirectTo.searchParams.set("next", "/reset-password");

    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: redirectTo.toString() }
    );

    if (error) {
      // 사용자에게는 성공과 구분되지 않게 돌려주되, 조용히 사라지게 두지 않는다.
      // 발송이 계속 실패하는데 화면은 늘 "보냈습니다" 라고 말하는 상태가
      // 가장 오래 안 들킨다.
      logError("[password-reset] recover_failed", error, {
        path: "/api/auth/password-reset",
        additionalData: { status: error.status ?? null },
      });
    }

    return successJson(GENERIC_OK);
  } catch (error) {
    logError("Password reset request failed", error, {
      path: "/api/auth/password-reset",
    });
    // 여기서도 구분하지 않는다.
    return successJson(GENERIC_OK);
  }
}
