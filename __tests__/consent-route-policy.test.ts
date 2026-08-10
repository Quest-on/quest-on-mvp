import { describe, expect, it } from "vitest";
import { classifyRoute, SUPA_CONTINUITY_ACTIONS } from "@/lib/consent-route-policy";

import { readFileSync } from "fs";

describe("proxy — 보호 API 게이트 배선", () => {
  const proxySource = readFileSync("proxy.ts", "utf8");

  it("enforce 에서만 API 를 막는다", () => {
    // off/shadow/prompt 는 API 응답을 바꾸지 않아야 한다.
    expect(proxySource).toMatch(/if \(!modeBlocksApis\(apiMode\)\) return response;/);
  });

  it("proxy 는 protected 만 막는다", () => {
    // proxy 는 body 를 못 읽는다. 연속성 경로(`/api/chat` 등)는 소유권
    // 판정에 body 의 sessionId 가 필요하므로 여기서 판정하면 정상적인
    // 시험 중 요청이 428 로 끊긴다. 그래서 protected 만 막고 연속성은
    // 각 route 의 세션 소유권 검사에 맡긴다.
    expect(proxySource).toMatch(/if \(apiRouteClass !== "protected"\) return response;/);
  });

  it("/api/supa 는 route 가 판정하므로 proxy 가 건너뛴다", () => {
    // 양쪽에서 판정하면 같은 요청에 Supabase 왕복이 중복된다.
    expect(proxySource).toMatch(/pathname === "\/api\/supa"\) return response;/);
  });

  it("proxy 는 body 기반 소유권 판정을 시도하지 않는다", () => {
    // pathname 만 넘기면 body 에 sessionId 를 담는 연속성 경로에서
    // 소유권 확인이 항상 실패해 정상 요청이 차단된다.
    const apiBlock = proxySource.slice(
      proxySource.indexOf('if (pathname.startsWith("/api/"))'),
      proxySource.indexOf("// 테스트 바이패스"),
    );
    expect(apiBlock).not.toContain("ownsInProgressSession");
  });

  it("미인증은 가로채지 않고 route 의 401 에 맡긴다", () => {
    expect(proxySource).toMatch(/if \(!apiUser\) return response;/);
  });

  it("mode 설정 오류는 조용히 통과하지 않는다", () => {
    expect(proxySource).toContain("CONSENT_GATE_MISCONFIGURED");
  });

  it("차단 응답은 428 과 redirect 를 준다", () => {
    expect(proxySource).toMatch(/error: "CONSENT_REQUIRED", redirect: "\/onboarding"/);
    expect(proxySource).toMatch(/status: 428/);
  });
});

describe("consent route allow table", () => {
  it("classifies every onboarding support route exactly", () => {
    for (const route of [
      ["GET", "/api/consents/onboarding"], ["POST", "/api/consents/onboarding"], ["PATCH", "/api/user/profile"],
      ["GET", "/api/student/profile"], ["POST", "/api/student/profile"], ["GET", "/api/instructor/profile"],
      ["POST", "/api/instructor/profile"], ["GET", "/api/universities/search"], ["POST", "/api/auth/revoke-other-sessions"],
    ]) expect(classifyRoute(route[1], route[0])).toBe("onboarding_support");
  });
  it("keeps non-exceptions default-denied", () => {
    for (const route of [["DELETE", "/api/student/profile"], ["POST", "/api/upload"], ["GET", "/api/instructor/exams"], ["OPTIONS", "/api/chat"], ["POST", "/api/drive"], ["POST", "/api/feedback-chat"]]) {
      expect(classifyRoute(route[1], route[0])).toBe("protected");
    }
    expect(classifyRoute("/legal/privacy", "GET")).toBe("public");
  });
  it("limits supa continuity to its explicit actions", () => {
    for (const action of SUPA_CONTINUITY_ACTIONS) expect(classifyRoute("/api/supa", "POST", action)).toBe("exam_continuity");
    expect(classifyRoute("/api/supa", "POST", "get_instructor_exams")).toBe("protected");
  });
});
