import { describe, expect, it } from "vitest";
import { classifyRoute, SUPA_CONTINUITY_ACTIONS } from "@/lib/consent-route-policy";

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
