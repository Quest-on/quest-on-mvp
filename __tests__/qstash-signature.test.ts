/**
 * QStash 워커 fail-open 회귀 가드.
 *
 * 버그: 워커가 `QSTASH_CURRENT_SIGNING_KEY ? verify : handler` 로, 서명키가 없으면
 * 프로덕션에서도 무인증으로 열렸다. 이 테스트는 정책 판정이 프로덕션에서 fail-closed
 * (reject)임을 잠근다.
 */
import { describe, expect, it } from "vitest";
import { qstashGuardMode } from "@/lib/qstash-signature";

describe("qstashGuardMode", () => {
  it("서명키가 있으면 항상 verify", () => {
    expect(qstashGuardMode({ QSTASH_CURRENT_SIGNING_KEY: "sig", VERCEL: "1" })).toBe("verify");
    expect(qstashGuardMode({ QSTASH_CURRENT_SIGNING_KEY: "sig", NODE_ENV: "development" })).toBe("verify");
  });

  it("서명키 없음 + Vercel 프로덕션이면 reject (fail-closed)", () => {
    expect(qstashGuardMode({ VERCEL: "1" })).toBe("reject");
  });

  it("서명키 없음 + NODE_ENV=production 이면 reject (fail-closed)", () => {
    expect(qstashGuardMode({ NODE_ENV: "production" })).toBe("reject");
  });

  it("서명키 없음 + 로컬 개발이면 passthrough", () => {
    expect(qstashGuardMode({ NODE_ENV: "development" })).toBe("passthrough");
    expect(qstashGuardMode({})).toBe("passthrough");
  });

  it("빈 문자열 서명키는 미설정으로 취급한다", () => {
    expect(qstashGuardMode({ QSTASH_CURRENT_SIGNING_KEY: "", VERCEL: "1" })).toBe("reject");
  });
});
