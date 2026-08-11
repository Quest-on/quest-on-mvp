import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { isAuthBypassAllowedEnv } from "./app-env";

export type AppUser = {
  id: string; // Supabase UUID
  email: string;
  role: "instructor" | "student";
  status: "pending" | "approved";
  fullName: string | null;
  avatarUrl: string | null;
};

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
    // 헤더가 없거나 틀리면 바이패스만 무시하고 정상 Supabase 세션 검증으로
    // 내려간다. 여기서 null을 반환하면 E2E에서 TEST_BYPASS_SECRET을 켠 순간
    // 실제 email/OAuth 세션을 아무도 사용할 수 없게 된다.
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

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile.role as AppUser["role"],
    status: (profile.status ?? "approved") as AppUser["status"],
    fullName: profile.display_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
  };
}
