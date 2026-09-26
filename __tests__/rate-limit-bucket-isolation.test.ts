/**
 * Upstash limiter 가 **버킷(config)별로** 만들어지는지 (이슈 #457).
 *
 * 예전에는 모듈 전역 플래그 하나로 limiter 를 한 번만 만들었다. 주석은
 * "once per config change" 라고 말했지만 코드는 config 를 키로 쓰지 않아서,
 * 한 인스턴스에서 **먼저 초기화한 버킷의 한도가 나머지 전부에 적용**됐다.
 *
 * 가장 크게 어긋나는 건 `passwordReset`(3 / 300s) 이다. `/api/chat`(30/60s)이
 * 먼저 뜨면 재설정 메일 발송이 시간당 36통이 아니라 1800통까지 열린다 —
 * 로그인 없이 남의 받은편지함에 메일을 넣는 동작이다.
 *
 * ## 왜 `checkRateLimitAsync` 로 테스트하지 않나
 *
 * 그 경로는 `require()` 로 선택적 의존성을 늦게 부른다. `vi.mock` 은 ESM
 * import 를 가로채므로 걸리지 않고, 결국 **실제 Redis 로 네트워크를 시도**해
 * 테스트가 수 초씩 걸린 뒤 in-memory 로 떨어진다. 처음에 그렇게 썼다가
 * 전부 실패했다.
 *
 * `getUpstashRatelimit` 은 생성자만 부른다 — `new Redis(...)` 도
 * `new Ratelimit(...)` 도 연결하지 않는다. 직접 부르면 네트워크 없이
 * 캐시 동작만 관찰할 수 있다.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getUpstashRatelimit, RATE_LIMITS } from "../lib/rate-limit";

const ENV = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"] as const;
let backup: Partial<Record<(typeof ENV)[number], string | undefined>> = {};

beforeEach(() => {
  backup = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
});

// 워커 프로세스 공유 값이다. 복구하지 않으면 다른 파일이 Upstash 가 켜진
// 것으로 오해한다.
afterEach(() => {
  for (const k of ENV) {
    const v = backup[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("#457 — 버킷마다 자기 한도를 쓴다", () => {
  it("먼저 초기화한 버킷이 나머지를 덮어쓰지 않는다", () => {
    // 인스턴스의 첫 요청이 chat(30/60s) 이다 — 예전이라면 이게 고정됐다.
    const chat = getUpstashRatelimit(RATE_LIMITS.chat);
    const reset = getUpstashRatelimit(RATE_LIMITS.passwordReset);

    expect(chat).not.toBeNull();
    expect(reset).not.toBeNull();
    // 같은 객체를 돌려주면 두 버킷이 같은 한도를 쓴다는 뜻이다.
    expect(reset).not.toBe(chat);
  });

  it("같은 버킷을 다시 부르면 같은 limiter 를 재사용한다", () => {
    const a = getUpstashRatelimit(RATE_LIMITS.passwordReset);
    const b = getUpstashRatelimit(RATE_LIMITS.passwordReset);
    expect(a).toBe(b);
  });

  it("한도·창이 같으면 같은 limiter 를 공유한다", () => {
    // 캐시 키가 버킷 이름이 아니라 (limit, windowSec) 이어야 한다.
    // 이름으로 키를 잡으면 같은 설정마다 limiter 가 늘어난다.
    const a = getUpstashRatelimit({ limit: 7, windowSec: 11 });
    const b = getUpstashRatelimit({ limit: 7, windowSec: 11 });
    const c = getUpstashRatelimit({ limit: 7, windowSec: 12 });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it("Upstash 설정이 없으면 null 을 준다 — in-memory 폴백", () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    expect(getUpstashRatelimit(RATE_LIMITS.passwordReset)).toBeNull();
  });

  it("passwordReset 은 다른 버킷보다 창이 길고 한도가 낮다", () => {
    // 이 차이가 무력화되는 것이 #457 의 실질적 피해다.
    expect(RATE_LIMITS.passwordReset.windowSec).toBeGreaterThan(
      RATE_LIMITS.chat.windowSec
    );
    expect(RATE_LIMITS.passwordReset.limit).toBeLessThan(RATE_LIMITS.chat.limit);
  });

  it("재설정 버킷 셋은 서로 다른 limiter 를 쓴다 (#318)", () => {
    // 받는 주소 버킷이 IP 버킷과 한도를 공유하면, IP 를 돌리는 사람을 막는
    // 유일한 장치가 사라진다.
    const ip = getUpstashRatelimit(RATE_LIMITS.passwordReset);
    const addr = getUpstashRatelimit(RATE_LIMITS.passwordResetAddress);
    const verify = getUpstashRatelimit(RATE_LIMITS.passwordResetVerify);
    expect(new Set([ip, addr, verify]).size).toBe(3);
  });

  it("받는 주소 버킷은 IP 버킷보다 창이 길다 — 한 받은편지함에 쌓이지 않는다", () => {
    expect(RATE_LIMITS.passwordResetAddress.windowSec).toBeGreaterThan(
      RATE_LIMITS.passwordReset.windowSec
    );
    expect(RATE_LIMITS.passwordResetAddress.limit).toBeLessThanOrEqual(
      RATE_LIMITS.passwordReset.limit
    );
  });
});
