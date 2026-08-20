import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LAYOUT = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");

/**
 * OG/Twitter 이미지의 절대 URL 기준. (metadataBase)
 *
 * 없으면 Next 가 경고를 내고 로컬에서는 `http://localhost:PORT` 로 해석한다.
 * Vercel 에서는 `VERCEL_URL` 로 떨어지는데 그건 **배포마다 바뀌는 주소**라,
 * 이미 공유된 링크의 미리보기 이미지가 옛 배포를 가리키게 된다.
 *
 * 우선순위는 `lib/qstash.ts` 의 `getWorkerBaseUrl` 과 같은 이유로 같게 뒀다.
 */
describe("metadataBase", () => {
  it("metadata 에 metadataBase 가 설정돼 있다", () => {
    expect(LAYOUT).toMatch(/metadataBase:/);
  });

  it("정규 도메인을 최우선으로 본다", () => {
    // NEXT_PUBLIC_APP_URL 이 배포돼도 안 바뀌는 주소다.
    const fn = LAYOUT.slice(LAYOUT.indexOf("function resolveMetadataBase"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    const appUrlAt = body.indexOf("NEXT_PUBLIC_APP_URL");
    const vercelAt = body.indexOf("VERCEL_URL");
    expect(appUrlAt).toBeGreaterThanOrEqual(0);
    expect(vercelAt).toBeGreaterThanOrEqual(0);
    // 순서가 뒤집히면 프로덕션에서 배포별 주소가 이긴다.
    expect(appUrlAt).toBeLessThan(vercelAt);
  });

  it("로컬 폴백이 있다", () => {
    const fn = LAYOUT.slice(LAYOUT.indexOf("function resolveMetadataBase"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toMatch(/localhost/);
  });

  it("OG 이미지가 여전히 상대 경로다", () => {
    // metadataBase 가 있으니 상대 경로가 옳다. 절대 URL 을 박으면 환경별로
    // 어긋나고 metadataBase 가 무의미해진다.
    expect(LAYOUT).toMatch(/url: "\/qstn_og\.png"/);
    expect(LAYOUT).not.toMatch(/url: "https?:\/\/[^"]*qstn_og/);
  });
});

/**
 * 하드코딩된 도메인이 metadata 에 새어 들어오지 않아야 한다.
 */
describe("환경 독립성", () => {
  it("metadata 블록에 하드코딩 도메인이 없다", () => {
    const start = LAYOUT.indexOf("export const metadata");
    const block = LAYOUT.slice(start, LAYOUT.indexOf("\n};", start));
    // resolveMetadataBase 호출만 있어야 한다. vercel.app 이나 quest-on.app 을
    // 직접 박으면 스테이징이 프로덕션 주소를 내보낸다.
    expect(block).not.toMatch(/quest-on\.app|vercel\.app/);
  });
});
