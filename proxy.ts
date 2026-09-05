import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthBypassAllowedEnv } from "@/lib/app-env";
import { evaluateConsentGate } from "@/lib/consent-gate";
import {
  getConsentGateMode,
  modeBlocksApis,
  modeBlocksPages,
  modeLogsOnly,
} from "@/lib/consent-gate-mode";
import { classifyRoute, ownsInProgressSession } from "@/lib/consent-route-policy";
import { logInfo } from "@/lib/logger";
import { safeInternalPath } from "@/lib/safe-redirect";

const isPublicRoute = (pathname: string) =>
  [
    "/",
    "/join",
    "/sign-in",
    "/sign-up",
    "/onboarding",
    "/legal",
    "/student/profile-setup",
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

  // API 라우트
  //
  // 판정 경계는 하나다. 페이지는 아래에서, API 는 여기서 판정하되
  // `/api/supa` 만 예외다 — 그건 body 의 `action` 까지 봐야 해서 route 가
  // 자기 auth 직후에 판정한다. 같은 요청을 두 번 판정하지 않는다.
  //
  // `enforce` 에서만 막는다. off/shadow/prompt 는 API 응답을 바꾸지 않는다.
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/supa") return response;

    // 공개·온보딩 지원·시험 연속성 경로는 게이트 설정을 읽기 전에
    // 통과시킨다. 그렇지 않으면 CONSENT_GATE_MODE 가 빠진 배포에서
    // `/api/cron/*`·`/api/health`까지 500으로 막혀 복구 경로가 사라진다.
    const apiRouteClass = classifyRoute(pathname, request.method);
    if (apiRouteClass !== "protected") return response;

    let apiMode;
    try {
      apiMode = getConsentGateMode();
    } catch {
      // 설정 오류를 조용히 통과시키면 게이트가 꺼진 줄 모른다.
      return NextResponse.json({ error: "CONSENT_GATE_MISCONFIGURED" }, { status: 500 });
    }
    if (!modeBlocksApis(apiMode)) return response;
    // proxy 는 body 를 읽을 수 없다. 그런데 `/api/chat` 같은 연속성 경로는
    // 소유권 판정에 body 의 sessionId 가 필요하다. 여기서 판정하면 정상적인
    // 시험 중 요청이 428 로 끊긴다 — 그건 이 설계가 가장 피해야 할 사고다.
    //
    // 그래서 proxy 는 `protected` 만 막는다. 연속성 경로는 각 route 가
    // 이미 세션 소유권을 확인하므로, 동의 미완료 사용자가 소유하지 않은
    // 세션에 접근하는 건 그 검사에서 걸린다.

    const apiSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) =>
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            ),
        },
      },
    );
    const {
      data: { user: apiUser },
    } = await apiSupabase.auth.getUser();

    // 미인증은 각 route 의 기존 auth 가 401 로 처리한다. 여기서 가로채지 않는다.
    if (!apiUser) return response;

    const apiGate = await evaluateConsentGate(apiUser.id);
    if (apiGate.complete) return response;

    void logInfo("consent_gate", {
      payload: {
        mode: apiMode,
        route_class: apiRouteClass,
        method: request.method,
        decision: "deny",
        reason: apiGate.reason,
      },
    });

    return NextResponse.json(
      { error: "CONSENT_REQUIRED", redirect: "/onboarding" },
      { status: 428 },
    );
  }

  // 테스트 바이패스: 쿠키 기반 (브라우저 E2E 테스트용). 프로덕션에서는 항상 꺼진다.
  const bypassSecret = process.env.TEST_BYPASS_SECRET;
  if (bypassSecret && isAuthBypassAllowedEnv()) {
    const bypassCookie = request.cookies.get("__test_bypass")?.value;
    if (bypassCookie === bypassSecret) {
      const role = request.cookies.get("__test_user_role")?.value || null;
      return applyRouteGuards(request, response, pathname, role, "test-bypass");
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
    // 원래 가려던 곳을 실어 보낸다.
    //
    // 학생이 시험 링크를 열었다가 여기로 튕기면, 로그인 뒤 기본 화면으로
    // 가버려서 링크가 통째로 유실됐다. 쿼리까지 보존해야 상태가 담긴
    // 딥링크가 살아난다. 돌려보낼 때 safeInternalPath 로 검증한다.
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }

  // profiles 테이블에서 role 읽기.
  //
  // status 는 더 이상 라우팅에 쓰지 않는다. 승인 대기(pending)로 교수자를 막던
  // 게이트를 걷어냈기 때문이다 — 에픽 #79 의 결정은 "승인은 차단이 아니라
  // plan 승격"이고, 여기서 막으면 가입 직후 데모를 겪게 하려던 흐름 전체가
  // 도달 불가가 된다.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? null;

  return applyRouteGuards(request, response, pathname, role, user.id);
}

async function applyRouteGuards(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
  role: string | null,
  userId: string
): Promise<NextResponse> {
  // 로그인된 유저가 공개 라우트(홈, 로그인 등)에 접근 → role에 맞는 대시보드로 리다이렉트
  // /onboarding과 legal 문서는 설정/정책 확인에 필요하므로 통과한다.
  if (isPublicRoute(pathname) && !["/auth/callback", "/join", "/onboarding", "/legal"].some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    if (!role) return NextResponse.redirect(new URL("/onboarding", request.url));
    if (role === "instructor") {

      return NextResponse.redirect(new URL("/instructor", request.url));
    }
    return NextResponse.redirect(new URL("/student", request.url));
  }

  if (isInstructorRoute(pathname)) {
    if (role !== "instructor") {
      return NextResponse.redirect(new URL("/student", request.url));
    }
  }
  if (isStudentRoute(pathname)) {
    if (role === "instructor") return NextResponse.redirect(new URL("/instructor", request.url));
    if (!role) return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  const routeClass = classifyRoute(pathname, request.method);
  const mode = getConsentGateMode();
  if (mode === "off" || routeClass === "public" || routeClass === "onboarding_support") return response;

  const gate = await evaluateConsentGate(userId);
  let decision = "allow";
  if (!gate.complete) {
    const continuityAllowed = routeClass === "exam_continuity" && await ownsInProgressSession(userId, pathname);
    if (!continuityAllowed && modeBlocksPages(mode)) decision = "redirect";
  }
  if (modeLogsOnly(mode) || !gate.complete) {
    void logInfo("consent_gate", { payload: { mode, route_class: routeClass, method: request.method, decision, reason: gate.complete ? "complete" : gate.reason } });
  }
  if (decision === "redirect") {
    const target = safeInternalPath(`${pathname}${request.nextUrl.search}`) ?? "/";
    const onboarding = new URL("/onboarding", request.url);
    onboarding.searchParams.set("redirect", target);
    return NextResponse.redirect(onboarding);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
