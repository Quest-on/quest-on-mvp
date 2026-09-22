/**
 * 비밀번호 재설정 경로가 **실제로 도달 가능한지** (이슈 #318).
 *
 * #444 는 화면·라우트·문구를 다 만들고 CI 를 전부 통과했는데 기능은 한 번도
 * 동작하지 않았다. 세 곳이 따로 막고 있었다.
 *
 *   1. `proxy.ts` 의 공개 라우트 목록에 `/forgot-password` 가 없어, 로그인
 *      못 하는 사람이 `/sign-in` 으로 되돌아왔다. 닫힌 루프였다.
 *   2. `consent-route-policy` 가 `/reset-password` 를 protected 로 분류해,
 *      콜백이 온보딩을 건너뛴 걸 프록시가 한 홉 뒤에 취소했다.
 *   3. 발송을 raw fetch 로 해서 implicit flow 링크가 발급됐고, 토큰이 URL
 *      프래그먼트로 와서 서버 콜백이 영영 못 읽었다.
 *
 * 기존 테스트가 못 잡은 이유가 분명하다 — `auth-callback-route.test.ts` 는
 * 라우트 핸들러만 부르고 프록시를 안 거치며, `password-reset-route.test.ts` 는
 * 전역 fetch 를 스텁해 **요청 모양만** 봤다. 그래서 여기서는 게이트 정의와
 * 발송 수단 자체를 본다.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyRoute } from "../lib/consent-route-policy";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const RECOVERY_PATHS = ["/forgot-password", "/reset-password"] as const;

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

    it.each(RECOVERY_PATHS)("%s 는 비로그인으로 들어올 수 있다", (path) => {
      // 없으면 로그인 페이지로 튕긴다 — 로그인을 못 하는 사람이 쓰는 화면인데.
      expect(publicList).toContain(path);
    });

    // 공개 목록은 **로그인된 사용자에게는 반대로** 작동한다 (이슈 #456).
    //
    //   if (isPublicRoute(pathname) && !예외목록.some(...)) → 대시보드로 리다이렉트
    //
    // 복구 링크는 세션을 만든다. 그러니 `/reset-password` 에 도달하는 사람은
    // 항상 로그인 상태이고, 예외목록에 없으면 폼을 못 본다. 처음 고칠 때
    // 공개 목록만 보고 "열었다" 고 했는데, 이 동선에서 **유일하게 의미 있는
    // 경우를 안 본 것**이었다.
    const guardExceptions = (() => {
      const src = read("proxy.ts");
      const at = src.indexOf("if (isPublicRoute(pathname) &&");
      const line = src.slice(at, src.indexOf("\n", at));
      return line.match(/"[^"]*"/g)?.map((x) => x.slice(1, -1)) ?? [];
    })();

    it("/reset-password 는 로그인돼 있어도 대시보드로 튕기지 않는다", () => {
      expect(guardExceptions).toContain("/reset-password");
    });

    it("/forgot-password 는 로그인했으면 대시보드로 보낸다", () => {
      // 이미 로그인한 사람이 비밀번호 찾기 화면에 있을 이유가 없다.
      // 게이트를 여는 예외는 넓히지 않는다.
      expect(guardExceptions).not.toContain("/forgot-password");
    });
  });

  describe("동의 게이트 (consent-route-policy)", () => {
    it.each(RECOVERY_PATHS)("%s 는 public 으로 분류된다", (path) => {
      expect(classifyRoute(path, "GET")).toBe("public");
    });

    it("보호 경로 분류는 그대로다 — 게이트를 통째로 열지 않았다", () => {
      expect(classifyRoute("/instructor", "GET")).toBe("protected");
      expect(classifyRoute("/settings", "GET")).toBe("protected");
      // 비슷하게 생긴 경로가 묻어 들어가지 않는다.
      expect(classifyRoute("/reset-password-extra", "GET")).toBe("protected");
    });
  });

  describe("발송 수단 (app/api/auth/password-reset)", () => {
    // 주석은 뺀다. 이 파일의 주석이 "예전엔 /auth/v1/recover 를 직접 불렀다"
    // 라고 설명하므로, 원문을 그대로 훑으면 코드가 아니라 설명에 걸린다.
    const src = read("app/api/auth/password-reset/route.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    it("SDK 로 보낸다 — raw fetch 로 /auth/v1/recover 를 부르지 않는다", () => {
      // raw fetch 는 code_challenge 를 안 붙여 implicit flow 링크를 만든다.
      // 그 링크의 토큰은 프래그먼트로 와서 서버 콜백이 못 읽는다.
      expect(src).not.toMatch(/auth\/v1\/recover/);
      expect(src).toContain("resetPasswordForEmail");
    });

    it("PKCE verifier 가 응답 쿠키로 나가게 서버 클라이언트를 쓴다", () => {
      // verifier 가 브라우저에 안 심기면 콜백의 exchangeCodeForSession 이 실패한다.
      expect(src).toContain("createServerClient");
      expect(src).toMatch(/cookies\s*:/);
      expect(src).toContain("setAll");
    });

    it("redirect_to 는 콜백을 거쳐 재설정 화면으로 온다", () => {
      expect(src).toContain("getAuthCallbackUrl");
      expect(src).toMatch(/"next",\s*"\/reset-password"/);
    });
  });

  describe("콜백이 복구만 온보딩을 건너뛴다", () => {
    const src = read("app/auth/callback/route.ts");

    it("건너뛰는 경로는 /reset-password 하나뿐이다", () => {
      const list = src.slice(
        src.indexOf("NEXT_PATHS_SKIPPING_ONBOARDING"),
        src.indexOf("export async function GET")
      );
      const paths = list.match(/"\/[^"]*"/g)?.map((s) => s.slice(1, -1)) ?? [];
      expect(paths).toEqual(["/reset-password"]);
    });
  });
});
