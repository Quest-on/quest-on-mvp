import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveAppEnv,
  invalidAppEnvDeclaration,
  appEnvDeclarationConflict,
  getAppEnv,
  isProductionApp,
  isStagingApp,
  isAuthBypassAllowedEnv,
} from "../lib/app-env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveAppEnv", () => {
  it("uses the explicit declaration over every other signal", () => {
    // 별도 Vercel 프로젝트로 띄운 스테이징은 VERCEL_ENV=production 이다.
    // 이 케이스를 못 잡으면 스테이징이 자기를 프로덕션이라고 믿는다.
    expect(
      resolveAppEnv({
        NEXT_PUBLIC_APP_ENV: "staging",
        VERCEL_ENV: "production",
        NODE_ENV: "production",
      })
    ).toBe("staging");
  });

  it("normalizes case and surrounding whitespace in the declaration", () => {
    expect(resolveAppEnv({ NEXT_PUBLIC_APP_ENV: "  Staging " })).toBe("staging");
  });

  it("ignores an unknown declaration and falls back to VERCEL_ENV", () => {
    expect(
      resolveAppEnv({ NEXT_PUBLIC_APP_ENV: "stg", VERCEL_ENV: "production" })
    ).toBe("production");
  });

  it("maps Vercel preview deployments to staging", () => {
    expect(resolveAppEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(
      "staging"
    );
  });

  it("maps Vercel production deployments to production", () => {
    expect(resolveAppEnv({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(
      "production"
    );
  });

  it("maps Vercel development to development even when NODE_ENV says production", () => {
    expect(
      resolveAppEnv({ VERCEL_ENV: "development", NODE_ENV: "production" })
    ).toBe("development");
  });

  it("falls back to NODE_ENV outside Vercel", () => {
    expect(resolveAppEnv({ NODE_ENV: "production" })).toBe("production");
    expect(resolveAppEnv({ NODE_ENV: "test" })).toBe("test");
    expect(resolveAppEnv({ NODE_ENV: "development" })).toBe("development");
  });

  it("defaults to development when nothing is set", () => {
    expect(resolveAppEnv({})).toBe("development");
  });
});

describe("invalidAppEnvDeclaration", () => {
  it("returns null for unset or valid values", () => {
    expect(invalidAppEnvDeclaration(undefined)).toBeNull();
    expect(invalidAppEnvDeclaration("")).toBeNull();
    expect(invalidAppEnvDeclaration("   ")).toBeNull();
    expect(invalidAppEnvDeclaration("staging")).toBeNull();
  });

  it("returns a message naming the offending value for a typo", () => {
    const message = invalidAppEnvDeclaration("stagng");
    expect(message).toContain("stagng");
    expect(message).toContain("staging");
  });
});

describe("environment predicates", () => {
  it("reads process.env at call time", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    expect(getAppEnv()).toBe("staging");
    expect(isStagingApp()).toBe(true);
    expect(isProductionApp()).toBe(false);
  });

  it("treats a Vercel production deployment as production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isProductionApp()).toBe(true);
  });
});

describe("isAuthBypassAllowedEnv", () => {
  it("allows the bypass only in local development and CI test runs", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    expect(isAuthBypassAllowedEnv()).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    expect(isAuthBypassAllowedEnv()).toBe(true);
  });

  it("blocks the bypass on staging — external QA users sign in for real there", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    expect(isAuthBypassAllowedEnv()).toBe(false);
  });

  it("blocks the bypass in production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    expect(isAuthBypassAllowedEnv()).toBe(false);
  });
});

/**
 * 리뷰 P1: 배포된 빌드에 NEXT_PUBLIC_APP_ENV=development|test 라벨이 잘못 들어가면
 * 라벨만 보고 바이패스를 열어줬다. 라벨은 사람이 대시보드에 손으로 넣는 값이고
 * VERCEL/VERCEL_ENV/NODE_ENV 는 플랫폼이 주입한다 — 신뢰도가 다르다.
 */
describe("isAuthBypassAllowedEnv — 배포 신호 hard-deny (리뷰 P1)", () => {
  it("VERCEL=1 이면 라벨이 development 여도 거부한다", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    expect(isAuthBypassAllowedEnv()).toBe(false);
  });

  it("VERCEL_ENV 가 있으면 라벨이 test 여도 거부한다", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isAuthBypassAllowedEnv()).toBe(false);
  });

  it("NODE_ENV=production 이면 라벨이 development 여도 거부한다 — 변경 전 동작 유지", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    vi.stubEnv("NODE_ENV", "production");
    expect(isAuthBypassAllowedEnv()).toBe(false);
  });

  it("로컬/CI 는 계속 허용한다 — 배포 신호가 없다", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    vi.stubEnv("NODE_ENV", "development");
    expect(isAuthBypassAllowedEnv()).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    vi.stubEnv("NODE_ENV", "test");
    expect(isAuthBypassAllowedEnv()).toBe(true);
  });
});

/**
 * 리뷰 P2: `--env staging` 으로 감사하는데 파일이 production 으로 뜨면,
 * 프리플라이트는 통과하고 배포는 프로덕션 동작(색인 허용·프로덕션 CORS)을 한다.
 */
describe("appEnvDeclarationConflict (리뷰 P2)", () => {
  it("선언이 요청한 환경과 다르면 잡아낸다", () => {
    const message = appEnvDeclarationConflict("production", "staging");
    expect(message).toContain("production");
    expect(message).toContain("staging");
  });

  it("선언과 요청이 같으면 통과한다 (대소문자·공백 무시)", () => {
    expect(appEnvDeclarationConflict("staging", "staging")).toBeNull();
    expect(appEnvDeclarationConflict("  Staging ", "staging")).toBeNull();
  });

  it("선언이 없으면 어긋남이 아니다 — 프로덕션은 선언이 선택 사항", () => {
    expect(appEnvDeclarationConflict(undefined, "production")).toBeNull();
    expect(appEnvDeclarationConflict("", "production")).toBeNull();
    expect(appEnvDeclarationConflict("   ", "production")).toBeNull();
  });

  it("오타 선언은 허용값 안내와 함께 거부한다", () => {
    const message = appEnvDeclarationConflict("stagng", "staging");
    expect(message).toContain("stagng");
    expect(message).toContain("not a valid app environment");
  });
});
