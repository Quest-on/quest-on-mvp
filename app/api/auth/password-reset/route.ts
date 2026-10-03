import { NextRequest, after } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { logError, logWarn } from "@/lib/logger";
import { isPasswordResetEnabled } from "@/lib/password-reset-availability";
import { isPasswordResetIntentKeyConfigured } from "@/lib/password-reset-intent";

/**
 * POST /api/auth/password-reset
 *
 * 비밀번호 재설정 메일 발송 요청 (이슈 #318).
 *
 * ## 링크는 어디로 가는가
 *
 * 메일 템플릿이 링크를 직접 만든다 (Supabase 대시보드 → Auth → Email
 * Templates → Reset password):
 *
 *   {{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&type=recovery
 *
 * `/auth/recovery` 는 버튼 하나짜리 확인 화면이고, 버튼을 누르면 서버가
 * `verifyOtp` 로 토큰을 확인해 세션을 만든다. 예전의 PKCE 링크
 * (`/auth/callback?code=…`)는 **요청한 브라우저의 verifier 쿠키가 있어야만**
 * 풀렸다. 휴대폰 메일 앱에서 누르면 실패했다.
 *
 * 그래서 여기서는 PKCE 를 쓰지 않는다(`flowType: "implicit"`). PKCE 로 보내면
 * GoTrue 가 토큰에 `pkce_` 접두어를 붙이고 challenge 를 요구해, 템플릿의
 * `TokenHash` 로는 확인되지 않는다. `redirectTo` 도 넘기지 않는다 — 템플릿이
 * `SiteURL` 로 링크를 만들므로 쓰이지 않는다.
 *
 * ## 한도는 두 겹이고, 응답이 다르다
 *
 *   - **IP** (`passwordReset`, 5분 3회): 넘으면 429. "이 IP 가 너무 많이
 *     눌렀다" 는 계정 존재 여부와 무관하고, 안 알려주면 사용자가 계속 누른다.
 *   - **받는 주소** (`passwordResetAddress`, 1시간 3회): 넘으면 **성공과 같은
 *     200** 을 주고 발송만 건너뛴다. 주소별로 응답이 달라지면 그게 계정 존재
 *     여부를 흘린다. IP 를 돌리는 공격자가 한 사람의 받은편지함을 채우거나,
 *     새 메일로 그 사람의 직전 링크를 계속 무효로 만드는 걸 막는다.
 *
 * Supabase 기본 메일러는 **프로젝트 전체** 시간당 발송 한도가 있다(staging
 * 기준 2통). 이 라우트의 한도는 그걸 넘지 않게 하는 게 아니라, 한 사람이
 * 그 한도를 혼자 다 쓰지 못하게 하는 것이다.
 *
 * ## 이메일 존재 여부를 흘리지 않는다
 *
 * 가입된 주소와 아닌 주소의 응답이 다르면, 이 엔드포인트는 계정 존재 여부를
 * 확인해 주는 도구가 된다. 교수자 명단은 대학 홈페이지에 공개돼 있어 대조가
 * 쉽다. 성공·미가입·업스트림 오류·주소 한도를 구분하지 않고 전부 같은 200 을
 * 준다.
 *
 * 바이트만 같아서는 모자란다. 가입된 주소면 GoTrue 가 요청 안에서 SMTP 를
 * 보내느라 늦게 돌아오고, 아니면 바로 돌아온다. 그래서 **발송은 응답 뒤에**
 * (`after()`) 한다. 응답 전까지 하는 일(IP 한도·검증·주소 한도)은 가입 여부와
 * 무관하다.
 */

const PasswordResetSchema = z.object({
  email: z.string().trim().email().max(320),
});

/** 실패해도 사용자에게는 성공과 같은 응답을 준다. */
const GENERIC_OK = { sent: true } as const;

const PATH = "/api/auth/password-reset";

export async function POST(request: NextRequest) {
  if (!isPasswordResetEnabled()) {
    return errorJson("NOT_FOUND", "Not found", 404);
  }

  try {
    const ipLimit = await checkRateLimitAsync(
      `password-reset:ip:${clientIp(request)}`,
      RATE_LIMITS.passwordReset
    );
    if (!ipLimit.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

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

    // 받는 쪽이 동작할 수 없으면 보내지 않는다. 링크를 눌러도 의도 쿠키를
    // 못 만들어 "링크가 만료되었습니다" 로 끝나는 메일은, 사용자의 발송
    // 한도와 프로젝트 메일 한도만 쓴다. 이건 사용자 잘못이 아니고 모든
    // 주소에 똑같이 적용되니 숨길 이유가 없다.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey || !isPasswordResetIntentKeyConfigured()) {
      logError(
        "[password-reset] misconfigured",
        new Error("supabase env or PASSWORD_RESET_INTENT_SECRET absent"),
        {
          path: PATH,
          additionalData: {
            supabase: Boolean(supabaseUrl && anonKey),
            intentKey: isPasswordResetIntentKeyConfigured(),
          },
        }
      );
      return errorJson("UNAVAILABLE", "Service unavailable", 503);
    }

    // 주소는 해시해서 키에만 쓴다 — 레이트리밋 저장소에 평문 이메일을 남기지
    // 않는다.
    const email = parsed.data.email.toLowerCase();
    const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 32);
    const addrLimit = await checkRateLimitAsync(
      `password-reset:addr:${emailKey}`,
      RATE_LIMITS.passwordResetAddress
    );
    if (!addrLimit.allowed) {
      // 응답은 성공과 같다. 대신 기록은 남긴다 — 한 주소에 몰리는 건 누군가
      // 그 사람을 겨냥하고 있다는 신호다.
      void logWarn("[password-reset] address_limited", {
        path: PATH,
        payload: { addr: emailKey.slice(0, 8) },
      });
      return successJson(GENERIC_OK);
    }

    after(() => sendRecoveryMail(supabaseUrl, anonKey, email));
    return successJson(GENERIC_OK);
  } catch (error) {
    logError("Password reset request failed", error, { path: PATH });
    // 여기서도 구분하지 않는다.
    return successJson(GENERIC_OK);
  }
}

/**
 * 응답이 나간 뒤에 돈다. 여기서 난 실패는 사용자에게 갈 길이 없으니 로그로만
 * 남긴다 — 조용히 사라지게 두지 않는다. 발송이 계속 실패하는데 화면은 늘
 * "보냈습니다" 라고 말하는 상태가 가장 오래 안 들킨다.
 */
async function sendRecoveryMail(supabaseUrl: string, anonKey: string, email: string) {
  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      // 프로젝트 메일 한도 초과(429)도 여기로 온다.
      logError("[password-reset] recover_failed", error, {
        path: PATH,
        additionalData: { status: error.status ?? null, code: error.code ?? null },
      });
    }
  } catch (error) {
    logError("[password-reset] recover_error", error, { path: PATH });
  }
}
