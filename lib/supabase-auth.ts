import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { isAuthBypassAllowedEnv } from "./app-env";
import { captureVerifiedSignup } from "./posthog-server";
import { logError } from "./logger";
import { getSupabaseServer } from "./supabase-server";

export type AppUser = {
  id: string; // Supabase UUID
  email: string;
  role: "instructor" | "student";
  status: "pending" | "approved";
  fullName: string | null;
  avatarUrl: string | null;
};

// 실제 활동 시각(last_seen_at) 추적 (#354). auth.users.last_sign_in_at 은 세션
// 리프레시에 갱신되지 않아 활동 지표로 쓸 수 없으므로, 인증 확인이 일어나는 이
// 경로에서 profiles.last_seen_at 을 갱신한다. 인스턴스당 사용자별 15분에 한 번만
// 쓰고, 실패해도 인증을 깨지 않는다. 035 migration 미적용 환경(42703)에서는
// 조용히 무시한다 — 배포와 DDL 적용 순서에 무관하게 인증이 살아 있어야 한다.
const LAST_SEEN_TOUCH_INTERVAL_MS = 15 * 60 * 1000;
const lastSeenTouchCache = new Map<string, number>();

async function touchLastSeenAt(userId: string): Promise<void> {
  const now = Date.now();
  const lastTouch = lastSeenTouchCache.get(userId);
  if (lastTouch !== undefined && now - lastTouch < LAST_SEEN_TOUCH_INTERVAL_MS) {
    return;
  }
  // await 전에 기록해 같은 인스턴스의 동시 currentUser() 호출을 중복 제거한다.
  lastSeenTouchCache.set(userId, now);
  try {
    const { error } = await getSupabaseServer()
      .from("profiles")
      .update({ last_seen_at: new Date(now).toISOString() })
      .eq("id", userId);
    if (!error) return;
    // 035 미적용 환경: 재시도해도 같으므로 캐시를 유지해 다음 스로틀 주기에 재시도.
    if (error.code === "42703") return;
    lastSeenTouchCache.delete(userId);
    void logError("[auth] Failed to touch profiles.last_seen_at", error, { user_id: userId });
  } catch (error) {
    lastSeenTouchCache.delete(userId);
    void logError("[auth] Failed to touch profiles.last_seen_at", error, { user_id: userId });
  }
}

export async function getSupabaseAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}

export async function currentUser(): Promise<AppUser | null> {
  // 테스트 바이패스 (로컬/CI E2E 전용). 판정 기준은 NODE_ENV 가 아니라 APP_ENV 다:
  // Vercel 배포는 스테이징도 NODE_ENV=production 이라 둘을 구분할 수 없었다.
  // 스테이징도 외부 QA 참여자가 들어오는 프로덕션급 환경이므로 바이패스를 허용하지
  // 않는다 — 키가 실수로 주입되면 조용히 무시하지 말고 즉시 throw 한다.
  const bypassSecret = process.env.TEST_BYPASS_SECRET;
  if (bypassSecret) {
    if (!isAuthBypassAllowedEnv()) {
      throw new Error(
        "[SECURITY] TEST_BYPASS_SECRET must not be set in a deployed environment (production/staging)."
      );
    }
    const { headers } = await import("next/headers");
    const hdrs = await headers();
    const token = hdrs.get("x-test-bypass-token");

    if (
      token &&
      token.length === bypassSecret.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(bypassSecret))
    ) {
      const testId = hdrs.get("x-test-user-id");
      const testRole = (hdrs.get("x-test-user-role") ?? "student") as AppUser["role"];
      if (testId) {
        return {
          id: testId,
          email: `${testId}@test.local`,
          role: testRole,
          status: "approved",
          fullName: "Test User",
          avatarUrl: null,
        };
      }
    }
    return null;
  }

  const supabase = await getSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  await touchLastSeenAt(user.id);
  await captureVerifiedSignup(user, profile.role ?? "");

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile.role as AppUser["role"],
    status: (profile.status ?? "approved") as AppUser["status"],
    fullName: profile.display_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
  };
}
