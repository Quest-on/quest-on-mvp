import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { getAccountLinkCallbackUrl } from "@/lib/auth-redirect";
import {
  ACCOUNT_LINK_COOKIE,
  ACCOUNT_LINK_CALLBACK_PATH,
  ACCOUNT_LINK_COOKIE_MAX_AGE,
  isLinkableProvider,
} from "@/lib/account-link-intent";

/**
 * 계정에 붙은 로그인 수단 (PR-2).
 *
 * GET    — 연결된 identity 목록
 * POST   — 연결 시작: 의도 쿠키를 발급하고 provider authorize URL 을 돌려준다
 * DELETE — 언링크 (identity 가 2개 이상일 때만)
 *
 * 인가는 Supabase 세션이 한다. 여기서 다루는 identity 는 전부 **현재 세션
 * 사용자의 것**이라 별도 소유권 조회가 없다 — `getUserIdentities()` 와
 * `unlinkIdentity()` 가 세션 사용자 범위로만 동작한다.
 */

const LinkSchema = z.object({ provider: z.string() });
const UnlinkSchema = z.object({ identityId: z.string().uuid() });

export async function GET() {
  const user = await currentUser();
  if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);

  const rl = await checkRateLimitAsync(`account-identities:${user.id}`, RATE_LIMITS.sessionRead);
  if (!rl.allowed) return errorJson("RATE_LIMITED", "Too many requests", 429);

  const supabase = await getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) {
    logError("[account-identities] list failed", error, { path: "/api/account/identities" });
    return errorJson("FETCH_FAILED", "Failed to load identities", 500);
  }

  return successJson({
    identities: (data?.identities ?? []).map((i) => ({
      id: i.identity_id,
      provider: i.provider,
      email: typeof i.identity_data?.email === "string" ? i.identity_data.email : null,
      createdAt: i.created_at ?? null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);

  const rl = await checkRateLimitAsync(`account-link:${user.id}`, RATE_LIMITS.general);
  if (!rl.allowed) return errorJson("RATE_LIMITED", "Too many requests", 429);

  const parsed = LinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isLinkableProvider(parsed.data.provider)) {
    return errorJson("INVALID_INPUT", "Unsupported provider", 400);
  }
  const provider = parsed.data.provider;

  const callbackUrl = getAccountLinkCallbackUrl(request.nextUrl.origin);

  const supabase = await getSupabaseAuthClient();
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: callbackUrl, skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    logError("[account-identities] linkIdentity failed", error, {
      path: "/api/account/identities",
      additionalData: { provider },
    });
    return errorJson("LINK_FAILED", "Failed to start linking", 500);
  }

  const nonce = randomBytes(24).toString("base64url");
  const response = successJson({ url: data.url });
  response.cookies.set(ACCOUNT_LINK_COOKIE, encodeURIComponent(JSON.stringify({ nonce, userId: user.id, provider })), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: ACCOUNT_LINK_CALLBACK_PATH,
    maxAge: ACCOUNT_LINK_COOKIE_MAX_AGE,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);

  const rl = await checkRateLimitAsync(`account-unlink:${user.id}`, RATE_LIMITS.general);
  if (!rl.allowed) return errorJson("RATE_LIMITED", "Too many requests", 429);

  const parsed = UnlinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorJson("INVALID_INPUT", "Invalid input", 400);

  const supabase = await getSupabaseAuthClient();
  const { data, error: listError } = await supabase.auth.getUserIdentities();
  if (listError) {
    logError("[account-identities] list before unlink failed", listError, { path: "/api/account/identities" });
    return errorJson("FETCH_FAILED", "Failed to load identities", 500);
  }

  const identities = data?.identities ?? [];
  // AC-17: 마지막 로그인 수단은 못 뗀다. 떼면 다시 못 들어온다.
  if (identities.length < 2) {
    return errorJson("LAST_IDENTITY", "Cannot unlink the only sign-in method", 409);
  }
  const target = identities.find((i) => i.identity_id === parsed.data.identityId);
  if (!target) return errorJson("NOT_FOUND", "Identity not found", 404);

  const { error } = await supabase.auth.unlinkIdentity(target);
  if (error) {
    logError("[account-identities] unlink failed", error, {
      path: "/api/account/identities",
      additionalData: { provider: target.provider },
    });
    return errorJson("UNLINK_FAILED", "Failed to unlink", 500);
  }

  return successJson({ unlinked: target.provider });
}
