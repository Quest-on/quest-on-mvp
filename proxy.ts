import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthBypassAllowedEnv } from "@/lib/app-env";

const isPublicRoute = (pathname: string) =>
  [
    "/",
    "/join",
    "/sign-in",
    "/sign-up",
    "/onboarding",
    "/instructor-pending",
    "/auth/callback",
  ].some((r) => pathname === r || pathname.startsWith(r + "/"));

const isAdminRoute = (pathname: string) =>
  pathname.startsWith("/admin") || pathname.startsWith("/api/admin");

const isInstructorRoute = (pathname: string) =>
  pathname.startsWith("/instructor");

const isStudentRoute = (pathname: string) => pathname.startsWith("/student");

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  // 어드민 라우트는 별도 인증 (admin-auth.ts)
  if (isAdminRoute(pathname)) return response;

  // API 라우트는 리다이렉트하지 않음
  if (pathname.startsWith("/api/")) return response;

  // 테스트 바이패스: 쿠키 기반 (브라우저 E2E 테스트용). 프로덕션에서는 항상 꺼진다.
  const bypassSecret = process.env.TEST_BYPASS_SECRET;
  if (bypassSecret && isAuthBypassAllowedEnv()) {
    const bypassCookie = request.cookies.get("__test_bypass")?.value;
    if (bypassCookie === bypassSecret) {
      const role = request.cookies.get("__test_user_role")?.value || null;
      const isPending = false;
      return applyRouteGuards(request, response, pathname, role, isPending);
    }
  }

  // Supabase 세션 쿠키 갱신
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          ),
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미인증 → 공개 라우트 통과, 나머지는 로그인 페이지
  if (!user) {
    if (isPublicRoute(pathname)) return response;
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // profiles 테이블에서 role/status 읽기
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? null;
  const isPending = profile?.status === "pending";

  return applyRouteGuards(request, response, pathname, role, isPending);
}

function applyRouteGuards(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
  role: string | null,
  isPending: boolean,
): NextResponse {
  // 로그인된 유저가 공개 라우트(홈, 로그인 등)에 접근 → role에 맞는 대시보드로 리다이렉트
  // /onboarding은 제외: role이 없으면 여기서 설정해야 하므로 통과, role이 있어도 접근 허용 (페이지가 자체 처리)
  if (isPublicRoute(pathname) && pathname !== "/auth/callback" && pathname !== "/join" && pathname !== "/onboarding") {
    if (!role) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    if (role === "instructor") {
      if (isPending) {
        if (pathname !== "/instructor-pending") {
          return NextResponse.redirect(new URL("/instructor-pending", request.url));
        }
        return response;
      }
      return NextResponse.redirect(new URL("/instructor", request.url));
    }
    // student
    return NextResponse.redirect(new URL("/student", request.url));
  }

  if (isInstructorRoute(pathname)) {
    if (role !== "instructor") {
      return NextResponse.redirect(new URL("/student", request.url));
    }
    if (isPending) {
      return NextResponse.redirect(new URL("/instructor-pending", request.url));
    }
  }

  if (isStudentRoute(pathname)) {
    if (role === "instructor") {
      return NextResponse.redirect(new URL("/instructor", request.url));
    }
    if (!role) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
