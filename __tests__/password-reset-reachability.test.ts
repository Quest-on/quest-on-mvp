/**
 * 비밀번호 재설정 경로가 **실제로 도달 가능한지** (이슈 #318).
 *
 * #444 는 화면·라우트·문구를 다 만들고 CI 를 전부 통과했는데 기능은 한 번도
 * 동작하지 않았다. 세 곳이 따로 막고 있었다.
 *
 *   1. `proxy.ts` 의 공개 라우트 목록에 `/forgot-password` 가 없어, 로그인
 *      못 하는 사람이 `/sign-in` 으로 되돌아왔다. 닫힌 루프였다.
 *   2. `consent-route-policy` 가 `/reset-password` 를 protected 로 분류해,
 *      필수 동의가 남은 사용자는 비밀번호를 바꾸기 전에 온보딩에 갇혔다.
 *   3. 발송 수단과 링크를 받는 쪽이 서로 다른 플로우를 가정했다.
 *
 * 라우트 핸들러 단위 테스트는 프록시를 안 거치고, SDK 를 스텁하면 요청 모양만
 * 본다. 그래서 여기서는 게이트 정의와 발송 수단 자체를 본다.
 *
 * 지금 동선: 메일 → `/auth/recovery`(확인 화면) → 버튼(POST verify) →
 * `/reset-password` → POST complete.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classifyRoute } from "../lib/consent-route-policy";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** 주석을 뺀 소스. 주석이 옛 설계를 설명하므로 원문을 훑으면 설명에 걸린다. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const RECOVERY_PAGES = ["/forgot-password", "/auth/recovery", "/reset-password"] as const;

describe("#318 — 재설정 화면에 도달할 수 있다", () => {
  describe("인증 게이트 (proxy.ts)", () => {
    // proxy.ts 의 isPublicRoute 는 배열 리터럴이라 직접 부를 수 없다.
    // 목록 자체를 읽어 대조한다.
    const publicList = (() => {
      const src = read("proxy.ts");
      const block = src.slice(
        src.indexOf("const isPublicRoute"),
        src.indexOf("const isAdminRoute")
      );
      return block.match(/"\/[^"]*"/g)?.map((s) => s.slice(1, -1)) ?? [];
    })();

    it.each(RECOVERY_PAGES)("%s 는 비로그인으로 들어올 수 있다", (path) => {
      // 없으면 로그인 페이지로 튕긴다 — 로그인을 못 하는 사람이 쓰는 화면인데.
      expect(publicList).toContain(path);
    });

    // 공개 목록은 **로그인된 사용자에게는 반대로** 작동한다 (이슈 #456).
    //
    //   if (isPublicRoute(pathname) && !예외목록.some(...)) → 대시보드로 리다이렉트
    //
    // 복구 링크 확인은 세션을 만든다. 그러니 `/reset-password` 에 도달하는
    // 사람은 항상 로그인 상태이고, 예외가 없으면 폼을 못 본다.
    const proxySrc = code("proxy.ts");
    const exemptPaths = (() => {
      const at = proxySrc.indexOf('!["/auth/callback"');
      expect(at).toBeGreaterThan(-1);
      const list = proxySrc.slice(at, proxySrc.indexOf("]", at));
      return list.match(/"[^"]*"/g)?.map((x) => x.slice(1, -1)) ?? [];
    })();

    it("/reset-password 예외는 **이 사용자에게 서명된 의도 쿠키**로만 열린다", () => {
      // 정적 목록에 넣으면 아무 로그인 사용자나 그 화면을 연다 — 그 화면은
      // 현재 비밀번호를 묻지 않는다(#447).
      expect(proxySrc).toMatch(
        /resetIntent\s*=[\s\S]{0,300}readPasswordResetIntent\([\s\S]{0,120}PASSWORD_RESET_COOKIE[\s\S]{0,80}userId\s*===\s*userId/
      );
      // 대시보드 리다이렉트 조건에서 실제로 쓰인다.
      expect(proxySrc).toMatch(/!resetIntent/);
    });

    it("/auth/recovery 는 로그인 상태여도 통과한다", () => {
      // 다른 계정으로 로그인된 브라우저에서 메일 링크를 누를 수 있다. 여기서
      // 대시보드로 보내면 그 사람은 비밀번호를 영영 못 바꾼다.
      expect(exemptPaths).toContain("/auth/recovery");
    });

    it("정적 예외 목록에는 /reset-password 도 /forgot-password 도 없다", () => {
      // 무조건 여는 예외는 넓히지 않는다.
      expect(exemptPaths).not.toContain("/reset-password");
      // 이미 로그인한 사람이 비밀번호 찾기 화면에 있을 이유가 없다.
      expect(exemptPaths).not.toContain("/forgot-password");
    });
  });

  describe("동의 게이트 (consent-route-policy)", () => {
    it.each(RECOVERY_PAGES)("%s 는 public 으로 분류된다", (path) => {
      expect(classifyRoute(path, "GET")).toBe("public");
    });

    it.each(["verify", "complete"])(
      "POST /api/auth/password-reset/%s 는 public — 동의 미완료여도 비밀번호는 바꾼다",
      (leaf) => {
        expect(classifyRoute(`/api/auth/password-reset/${leaf}`, "POST")).toBe("public");
      }
    );

    it("보호 경로 분류는 그대로다 — 게이트를 통째로 열지 않았다", () => {
      expect(classifyRoute("/instructor", "GET")).toBe("protected");
      expect(classifyRoute("/settings", "GET")).toBe("protected");
      // 비슷하게 생긴 경로가 묻어 들어가지 않는다.
      expect(classifyRoute("/reset-password-extra", "GET")).toBe("protected");
      expect(classifyRoute("/auth/recovery-extra", "GET")).toBe("protected");
      // 쓰기 API 예외는 메서드·경로 정확 일치다.
      expect(classifyRoute("/api/auth/password-reset/complete", "GET")).not.toBe("public");
      expect(classifyRoute("/api/auth/password-reset/complete/x", "POST")).not.toBe("public");
    });
  });

  describe("발송 수단 (app/api/auth/password-reset)", () => {
    const src = code("app/api/auth/password-reset/route.ts");

    it("SDK 로 보낸다 — raw fetch 로 /auth/v1/recover 를 부르지 않는다", () => {
      expect(src).not.toMatch(/auth\/v1\/recover/);
      expect(src).toContain("resetPasswordForEmail");
    });

    it("implicit 플로우로 보낸다 — 템플릿의 TokenHash 가 verifyOtp 로 확인돼야 한다", () => {
      // PKCE 면 GoTrue 가 토큰에 `pkce_` 를 붙이고, 확인에 code_verifier 가
      // 필요해진다. 요청한 브라우저가 아니면 링크가 죽는다.
      expect(src).toMatch(/flowType:\s*"implicit"/);
      expect(src).not.toContain("createServerClient");
    });

    it("redirectTo 를 넘기지 않는다 — 링크는 메일 템플릿이 SiteURL 로 만든다", () => {
      expect(src).not.toMatch(/redirectTo/);
      expect(src).not.toContain("getAuthCallbackUrl");
    });
  });

  describe("복구 토큰을 만드는 건 재설정 메일뿐이다", () => {
    it("매직 링크 로그인(signInWithOtp)을 쓰지 않는다", () => {
      // GoTrue 는 가입된 사용자의 매직 링크 토큰을 복구 토큰과 같은 자리에
      // 둔다. 그래서 매직 링크의 token_hash 도 `type: "recovery"` 로 확인된다.
      // 매직 링크를 도입하면 로그인 메일이 곧 재설정 링크가 된다 — 도입하려면
      // verify 가 토큰의 출처를 가려낼 방법부터 정해야 한다.
      const hits: string[] = [];
      for (const dir of ["app", "lib", "components", "hooks"]) {
        for (const file of readdirSync(join(process.cwd(), dir), { recursive: true })) {
          const rel = `${dir}/${String(file).replaceAll("\\", "/")}`;
          if (!/\.(ts|tsx)$/.test(rel)) continue;
          if (code(rel).includes("signInWithOtp")) hits.push(rel);
        }
      }
      expect(hits).toEqual([]);
    });
  });

  describe("확인 화면 → verify", () => {
    const page = code("app/auth/recovery/page.tsx");

    it("링크를 여는 것만으로는 토큰을 쓰지 않는다", () => {
      // 메일 스캐너가 미리 열어 1회용 토큰을 태운다. 확인은 버튼의 POST 에서.
      expect(page).not.toContain("verifyOtp");
      expect(page).toMatch(/method="post"\s+action="\/api\/auth\/password-reset\/verify"/);
    });

    it("주소의 토큰을 다른 요청의 Referer 로 흘리지 않는다", () => {
      // origin 만 싣는다. 같은 origin 요청(비콘 등)에도 경로·쿼리가 안 간다.
      // no-referrer 는 폼 POST 의 Origin 을 null 로 만들어 구형 브라우저가
      // verify 를 통과하지 못한다.
      expect(page).toMatch(/referrer:\s*"strict-origin"/);
    });
  });

  describe("콜백은 복구를 다루지 않는다", () => {
    const src = code("app/auth/callback/route.ts");

    it("복구 분기도 의도 쿠키 발급도 없다", () => {
      // 예전엔 여기서 `next=/reset-password` 를 보고 분기했다. 그건 사용자가
      // 붙일 수 있는 값이라 평범한 OAuth 로그인에 붙이면 동의 게이트가 열렸다(#456).
      expect(src).not.toContain("isRecoverySession");
      expect(src).not.toContain("passwordResetIntentCookie");
      expect(src).not.toContain("issuePasswordResetIntent");
    });
  });
});
