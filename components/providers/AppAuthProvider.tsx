"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { createSupabaseClient } from "@/lib/supabase-client";
import { isAuthBypassAllowedEnv } from "@/lib/app-env";
import type { User } from "@supabase/supabase-js";

export type AppProfile = {
  role: "instructor" | "student";
  status: "pending" | "approved";
  fullName: string | null;
  avatarUrl: string | null;
  email: string;
};

type AppAuthState = {
  user: User | null;
  profile: AppProfile | null;
  isLoaded: boolean;
  isSignedIn: boolean;
};

const AuthContext = createContext<AppAuthState>({
  user: null,
  profile: null,
  isLoaded: false,
  isSignedIn: false,
});

// 테스트 바이패스: E2E 브라우저 테스트에서 Supabase 세션 없이 인증 제공
// proxy.ts가 서버에서 __test_bypass 쿠키를 이미 검증했으므로, 클라이언트에서는 쿠키 존재만 확인
function getTestBypassUser(): { user: User; profile: AppProfile } | null {
  if (process.env.NEXT_PUBLIC_TEST_BYPASS_ENABLED !== "true") return null;
  if (!isAuthBypassAllowedEnv()) return null;
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";").reduce(
    (acc, c) => {
      const [k, ...v] = c.trim().split("=");
      acc[k] = v.join("=");
      return acc;
    },
    {} as Record<string, string>,
  );

  if (!cookies["__test_bypass"] || !cookies["__test_user"]) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(cookies["__test_user"]));
    const role = (cookies["__test_user_role"] || "student") as AppProfile["role"];
    return {
      user: {
        id: parsed.id,
        email: parsed.email ?? `${parsed.id}@test.local`,
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "",
      } as User,
      profile: {
        role,
        status: "approved",
        fullName: [parsed.firstName, parsed.lastName].filter(Boolean).join(" ") || null,
        avatarUrl: null,
        email: parsed.email ?? `${parsed.id}@test.local`,
      },
    };
  } catch {
    return null;
  }
}

export function AppAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppAuthState>({
    user: null,
    profile: null,
    isLoaded: false,
    isSignedIn: false,
  });

  const loadProfile = useCallback(async (user: User) => {
    const supabase = createSupabaseClient();
    const { data } = await supabase
      .from("profiles")
      .select("role, status, display_name, avatar_url")
      .eq("id", user.id)
      .single();

    setState({
      user,
      profile: data
        ? {
            role: data.role as AppProfile["role"],
            status: (data.status ?? "approved") as AppProfile["status"],
            fullName: data.display_name ?? null,
            avatarUrl: data.avatar_url ?? null,
            email: user.email ?? "",
          }
        : null,
      isLoaded: true,
      isSignedIn: true,
    });
  }, []);

  useEffect(() => {
    // 테스트 바이패스: E2E 브라우저 테스트 환경에서는 Supabase 세션 대신 쿠키 사용
    const testUser = getTestBypassUser();
    if (testUser) {
      setState({
        user: testUser.user,
        profile: testUser.profile,
        isLoaded: true,
        isSignedIn: true,
      });
      return;
    }

    const supabase = createSupabaseClient();

    // 초기 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setState({ user: null, profile: null, isLoaded: true, isSignedIn: false });
      }
    });

    // 인증 상태 변경 구독
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setState({ user: null, profile: null, isLoaded: true, isSignedIn: false });
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  return (
    <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
  );
}

export function useAppUser() {
  return useContext(AuthContext);
}
