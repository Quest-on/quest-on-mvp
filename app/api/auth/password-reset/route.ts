import { NextRequest } from "next/server";
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
 * 클라이언트에서 `supabase.auth.resetPasswordForEmail()` 을 직접 부르지 않고
 * 이 라우트를 거치는 이유는 둘이다.
 *
 * 1. 레이트리밋. `lib/rate-limit.ts` 는 서버에만 있다. 재설정 발송은 로그인 없이
 *    부를 수 있는 몇 안 되는 쓰기 동작이라, 남이 남의 주소로 메일 폭탄을 보내는
 *    통로가 된다. Supabase 자체 한도만 믿으면 그 한도는 프로젝트 전역이라
 *    한 명이 소진하면 **모든 사용자의 재설정이 막힌다.**
 * 2. 응답 통일. 아래 참고.
 *
 * ## 이메일 존재 여부를 흘리지 않는다
 *
 * 가입된 주소와 아닌 주소의 응답이 다르면, 이 엔드포인트는 계정 존재 여부를
 * 확인해 주는 도구가 된다. 교수자 명단은 대학 홈페이지에 공개돼 있는 경우가
 * 많아서 대조가 쉽다. 그래서 성공·미가입·업스트림 오류를 **구분하지 않고**
 * 전부 같은 200 을 돌려준다. 실패는 서버 로그에만 남긴다.
 *
 * 레이트리밋 초과(429)만 예외다. 이건 "이 IP 가 너무 많이 눌렀다" 는 정보라
 * 계정 존재 여부와 무관하고, 안 알려주면 사용자가 계속 누른다.
 */

const PasswordResetSchema = z.object({
  email: z.string().trim().email().max(320),
});

/** 실패해도 사용자에게는 성공과 같은 응답을 준다. */
const GENERIC_OK = { sent: true } as const;

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await checkRateLimitAsync(
      `password-reset:${ip}`,
      RATE_LIMITS.passwordReset
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    const parsed = PasswordResetSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
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

    // 재설정 링크가 돌아올 곳. `next` 는 콜백이 세션 교환 뒤 보낼 내부 경로다.
    //
    // Supabase 는 redirect_to 가 프로젝트 허용목록에 없으면 조용히 Site URL 로
    // 갈아끼운다 — 그러면 사용자는 로그인만 된 채 홈에 떨어지고 비밀번호는
    // 그대로다. 허용목록에 `/auth/callback` 이 있고 쿼리스트링이 보존되는 것은
    // staging 에서 확인했다(#193).
    const redirectTo = new URL(
      getAuthCallbackUrl(new URL(request.url).origin)
    );
    redirectTo.searchParams.set("next", "/reset-password");

    const upstream = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/auth/v1/recover?redirect_to=${encodeURIComponent(
        redirectTo.toString()
      )}`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: parsed.data.email }),
      }
    );

    if (!upstream.ok) {
      // 사용자에게는 성공과 구분되지 않게 돌려주되, 조용히 사라지게 두지 않는다.
      // 발송이 계속 실패하는데 화면은 늘 "보냈습니다" 라고 말하는 상태가
      // 가장 오래 안 들킨다.
      logError(
        "[password-reset] recover_failed",
        new Error(`upstream ${upstream.status}`),
        {
          path: "/api/auth/password-reset",
          additionalData: { status: upstream.status },
        }
      );
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
