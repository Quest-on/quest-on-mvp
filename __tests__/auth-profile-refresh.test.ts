/**
 * 온보딩이 기록한 역할이 인증 컨텍스트에 반영되는가 (#338).
 *
 * AppAuthProvider 는 세션이 잡힐 때 profiles 를 한 번만 읽는다. 온보딩은 그
 * 뒤에 POST /api/user/role 로 role 을 쓰므로, 갱신 수단이 없으면 그 세션의
 * 컨텍스트는 계속 role: null 이다. instructor 레이아웃이 그걸 '역할 없음'으로
 * 읽어 /onboarding 으로 되돌리고, 데모까지 갔다가 튕겨 나온다.
 *
 * 이 저장소에는 React 렌더 테스트 인프라가 없다. 배선이 사라지는 회귀를
 * 소스 수준에서 막는다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const PROVIDER = read("components/providers/AppAuthProvider.tsx");
const ONBOARDING = read("app/(app)/onboarding/page.tsx");

describe("인증 컨텍스트 프로필 갱신", () => {
  it("provider 가 refreshProfile 을 노출한다", () => {
    expect(PROVIDER).toMatch(/refreshProfile: \(\) => Promise<void>/);
    expect(PROVIDER).toMatch(/const refreshProfile = useCallback\(/);
    // 컨텍스트 값에 실제로 실려야 소비자가 쓸 수 있다.
    expect(PROVIDER).toMatch(/\{ \.\.\.state, refreshProfile \}/);
  });

  it("온보딩이 이동 전에 프로필을 갱신한다", () => {
    expect(ONBOARDING).toMatch(/useAppUser\(\)/);
    expect(ONBOARDING).toContain("refreshProfile");
    // 데모 생성 경로: 갱신이 router.push 보다 앞서야 한다.
    const demoIdx = ONBOARDING.indexOf("const createDemo");
    expect(demoIdx).toBeGreaterThan(-1);
    const demoBody = ONBOARDING.slice(demoIdx, ONBOARDING.indexOf("if (!isLoaded || !user)", demoIdx));
    const refreshAt = demoBody.indexOf("await refreshProfile()");
    const pushAt = demoBody.indexOf("router.push(examId");
    expect(refreshAt).toBeGreaterThan(-1);
    expect(pushAt).toBeGreaterThan(refreshAt);
  });

  it("역할 확정 후 전체 리로드로 우회하지 않는다", () => {
    // #212: window.location.href 는 흰 화면을 거쳐 방금 만든 데모와 도착
    // 화면의 연결을 끊는다. 프로필을 갱신했으므로 전체 리로드가 필요 없다.
    expect(ONBOARDING).not.toMatch(/window\.location\.href = examId \?/);
    expect(ONBOARDING).not.toMatch(/window\.location\.href = "\/student"/);
  });
});
