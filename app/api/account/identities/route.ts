import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
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
 * POST   — 연결 시작: 의도 쿠키만 발급한다. `linkIdentity()` 자체는 브라우저가
 *          부른다 — PKCE code verifier 를 SDK 가 자기 저장소(쿠키)에 쓰는데,
 *          서버에서 부르면 그 쿠키가 응답에 실리지 않아 콜백의 교환이 실패한다
 *          (staging 실측). 기존 로그인 버튼이 브라우저에서 signInWithOAuth 를
 *          부르는 것과 같은 이유다.
 * DELETE — 언링크 (identity 가 2개 이상일 때만)
 *
 * 인가는 Supabase 세션이 한다. 여기서 다루는 identity 는 전부 **현재 세션
 * 사용자의 것**이라 별도 소유권 조회가 없다 — `getUserIdentities()` 와
 * `unlinkIdentity()` 가 세션 사용자 범위로만 동작한다.
 */

const LinkSchema = z.object({ provider: z.string() });
const UnlinkSchema = z.object({ identityId: z.string().uuid() });

type SignInMethod = {
  id: string | null;
  provider: string;
  email: string | null;
  createdAt: string | null;
};

/**
 * 로그인 수단 목록. `auth.identities` 행 + **비밀번호**.
 *
 * 소셜로 가입한 뒤 `updateUser({ password })` 로 비밀번호를 설정하면 Supabase 는
 * `email` identity 행을 만들지 않는다 — `encrypted_password` 만 채우고
 * `app_metadata.providers` 에 `email` 을 더한다. 그런데 이메일 로그인은 된다.
 * identity 만 세면 "수단 하나" 로 잡혀 소셜을 못 떼고 이메일이 목록에 없다(#408).
 *
 * 비밀번호 수단은 identity 행이 없으므로 `id: null` — `unlinkIdentity` 로 못 떼고
 * 비밀번호 변경 카드에서 다룬다. 하지만 **개수에는 센다** — 그래야 소셜 하나를
 * 떼도 들어올 길이 남는다는 판단이 맞는다.
 */
async function listSignInMethods(
  supabase: Awaited<ReturnType<typeof getSupabaseAuthClient>>
): Promise<{ methods: SignInMethod[]; raw: Awaited<ReturnType<typeof supabase.auth.getUserIdentities>>["data"] } | { error: unknown }> {
  const [{ data, error }, { data: userData, error: userError }] = await Promise.all([
    supabase.auth.getUserIdentities(),
    supabase.auth.getUser(),
  ]);
  if (error) return { error };
  if (userError) return { error: userError };

  const identities = data?.identities ?? [];
  const methods: SignInMethod[] = identities.map((i) => ({
    id: i.identity_id,
    provider: i.provider,
    email: typeof i.identity_data?.email === "string" ? i.identity_data.email : null,
    createdAt: i.created_at ?? null,
  }));

  const providers = (userData?.user?.app_metadata?.providers as unknown[] | undefined) ?? [];
  const hasPassword = providers.includes("email");
  const hasEmailIdentity = identities.some((i) => i.provider === "email");
  if (hasPassword && !hasEmailIdentity) {
    methods.unshift({
      id: null,
      provider: "email",
      email: userData?.user?.email ?? null,
      createdAt: null,
    });
  }

  return { methods, raw: data };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);

  const rl = await checkRateLimitAsync(`account-identities:${user.id}`, RATE_LIMITS.sessionRead);
  if (!rl.allowed) return errorJson("RATE_LIMITED", "Too many requests", 429);

  const supabase = await getSupabaseAuthClient();
  const listed = await listSignInMethods(supabase);
  if ("error" in listed) {
    logError("[account-identities] list failed", listed.error, { path: "/api/account/identities" });
    return errorJson("FETCH_FAILED", "Failed to load identities", 500);
  }

  return successJson({ identities: listed.methods });
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

  const nonce = randomBytes(24).toString("base64url");
  const response = successJson({ provider });
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
  const listed = await listSignInMethods(supabase);
  if ("error" in listed) {
    logError("[account-identities] list before unlink failed", listed.error, { path: "/api/account/identities" });
    return errorJson("FETCH_FAILED", "Failed to load identities", 500);
  }

  // AC-17: 마지막 로그인 수단은 못 뗼다. 떼면 다시 못 들어온다.
  // 비밀번호도 수단이다 — 소셜 하나 + 비밀번호면 소셜을 떼도 된다.
  if (listed.methods.length < 2) {
    return errorJson("LAST_IDENTITY", "Cannot unlink the only sign-in method", 409);
  }
  const identities = listed.raw?.identities ?? [];
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
