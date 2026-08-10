import { describe, expect, it } from "vitest";
import { classifyRoute, SUPA_CONTINUITY_ACTIONS } from "@/lib/consent-route-policy";

import { readFileSync } from "fs";

describe("proxy — 보호 API 게이트 배선", () => {
  const proxySource = readFileSync("proxy.ts", "utf8");

  it("enforce 에서만 API 를 막는다", () => {
    // off/shadow/prompt 는 API 응답을 바꾸지 않아야 한다.
    expect(proxySource).toMatch(/if \(!modeBlocksApis\(apiMode\)\) return response;/);
  });

  it("protected 분류에만 적용한다", () => {
    expect(proxySource).toMatch(
      /classifyRoute\(pathname, request\.method\) !== "protected"\) return response;/,
    );
  });

  it("/api/supa 는 route 가 판정하므로 proxy 가 건너뛴다", () => {
    // 양쪽에서 판정하면 같은 요청에 Supabase 왕복이 중복된다.
    expect(proxySource).toMatch(/pathname === "\/api\/supa"\) return response;/);
  });

  it("소유한 in_progress 세션은 통과시킨다", () => {
    expect(proxySource).toMatch(/ownsInProgressSession\(apiUser\.id, pathname\)/);
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
