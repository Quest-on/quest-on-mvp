import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { isAuthBypassAllowedEnv } from "./app-env";
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

type ProfileRow = {
  role: string | null;
  status: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const PROFILE_COLUMNS = "role, status, display_name, avatar_url";

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Supabase Auth 가입은 `auth.users` 만 만든다. `public.profiles` 는 어떤 코드도
 * 만들지 않아서, 신규 가입자는 첫 요청부터 `currentUser()` 가 null 이 되고
 * 온보딩 API 전부가 401 이었다 — 온보딩을 끝내야 프로필이 생기는데 프로필이
 * 없어서 온보딩을 못 끝내는 교착이다(스테이징 QA 전면 차단).
 *
 * "인증됐는데 프로필 행이 없다"는 권한 없음이 아니라 아직 안 만들어진 것이므로
 * 여기서 만든다. 이 행의 생성 책임을 DB 트리거 같은 저장소 밖 설정에 두면
 * 환경마다 갈라진다 — 실제로 CI 에만 트리거가 있었고 스테이징에는 없었다.
 *
 * 역할은 이메일 가입이 남긴 `user_metadata.role` 힌트만 반영한다. OAuth 는
 * 힌트를 실을 수 없어 null 로 남고 `POST /api/user/role` 이 단 한 번 확정한다 —
 * 여기서 추측하면 잘못된 역할로 계정이 굳는다.
 */
async function provisionProfile(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): Promise<ProfileRow | null> {
  const metadata = user.user_metadata ?? {};
  const signupRole = metadataString(metadata, "role");
  const admin = getSupabaseServer();

  // `019_profiles_rls.sql` 이 authenticated 의 쓰기를 회수했으므로 세션 클라이언트로는
  // 넣을 수 없다. 동시에 들어온 요청이 둘 다 INSERT 하는 경합은 DB 가 처리하게 둔다.
  const { error } = await admin.from("profiles").upsert(
    {
      id: user.id,
      role: signupRole === "instructor" || signupRole === "student" ? signupRole : null,
      // 승인 대기는 걷어냈다(#79). 가입 직후 바로 활동하고 제어는 plan 한도가 한다.
      status: "approved",
      // 스테이징·프로덕션의 profiles.display_name 은 NOT NULL 이다. 온보딩이
      // 곧 실제 이름으로 덮어쓰므로 여기서는 빈 문자열이라도 채운다.
      display_name:
        metadataString(metadata, "full_name") ??
        metadataString(metadata, "name") ??
        (user.email ? user.email.split("@")[0] : ""),
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (error) {
    void logError("[auth] Failed to provision profile row", error, {
      user_id: user.id,
    });
    return null;
  }

  const { data } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  return (data as ProfileRow | null) ?? null;
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
    // 헤더가 없거나 틀리면 바이패스만 무시하고 정상 Supabase 세션 검증으로
    // 내려간다. 여기서 null을 반환하면 E2E에서 TEST_BYPASS_SECRET을 켠 순간
    // 실제 email/OAuth 세션을 아무도 사용할 수 없게 된다.
  }

  const supabase = await getSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  // 행이 없으면 만든다. 여기서 null 을 돌려주면 신규 가입자가 온보딩을 끝낼 수 없다.
  const profile = (data as ProfileRow | null) ?? (await provisionProfile(user));

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
