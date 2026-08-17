import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * `globals.css` 에는 `body` 블록이 두 개다 — 한글 줄바꿈 블록과 타이포 블록.
 * 첫 매치를 잡으면 엉뚱한 블록을 본다. `font-size` 를 선언한 블록만 고른다.
 */
function typographyBodyBlock(css: string): string {
  const blocks = css.match(/ {2}body \{[^}]*\}/g) ?? [];
  const target = blocks.find((b) => /font-size:/.test(b));
  if (!target) throw new Error("font-size 를 선언한 body 블록이 없다");
  return target;
}

/**
 * 본문 앵커는 16px 다.
 *
 * 여기가 흔들리면 나머지 위계가 다 흔들린다. 예전에는 15px 였는데 의도한
 * 결정이 아니라 무관한 커밋(`folder shape`)에 딸려 들어온 값이었고, 두
 * 가지와 어긋났다 — `type-body` 가 `text-base`(16px) 를 쓰고, 같은 블록의
 * `letter-spacing: -0.3px` 는 16~17px 본문에 맞춘 값이다.
 */
describe("본문 앵커", () => {
  const CSS = read("app/globals.css");

  it("body 가 16px 다", () => {
    expect(typographyBodyBlock(CSS)).toMatch(/font-size:\s*16px/);
  });

  it("15px 로 되돌아가지 않았다", () => {
    expect(typographyBodyBlock(CSS)).not.toMatch(/font-size:\s*15px/);
  });

  it("행간이 1.6 이다", () => {
    // 16 x 1.6 = 25.6px. UI 규칙의 본문 권장값.
    expect(typographyBodyBlock(CSS)).toMatch(/line-height:\s*1\.6/);
  });

  it("type-body 가 앵커와 같은 크기를 가리킨다", () => {
    // text-base = 1rem = 16px. body 와 어긋나면 같은 본문이 두 크기로 나온다.
    const scale = CSS.slice(CSS.indexOf(".type-body {"));
    expect(scale.slice(0, 120)).toMatch(/text-base/);
  });
});

/**
 * 라우트 전환 시 스크롤이 튀지 않아야 한다.
 *
 * `html { scroll-behavior: smooth }` 와 `data-scroll-behavior="smooth"` 는
 * 짝이다. 표시가 없으면 Next 의 스크롤 복원이 애니메이션으로 처리돼 페이지가
 * 스르륵 움직인다. 개발 서버가 경고로 알려준다.
 */
describe("스크롤 전환", () => {
  it("html 에 data-scroll-behavior 가 있다", () => {
    expect(read("app/layout.tsx")).toMatch(/data-scroll-behavior="smooth"/);
  });

  it("css 의 smooth 선언과 짝이 맞는다", () => {
    // 한쪽만 있으면 무의미하다. CSS 에서 smooth 를 빼면 이 속성도 필요 없다.
    const css = read("app/globals.css");
    const hasSmooth = /html\s*\{[^}]*scroll-behavior:\s*smooth/.test(css);
    const hasAttr = /data-scroll-behavior="smooth"/.test(read("app/layout.tsx"));
    expect(hasSmooth).toBe(hasAttr);
  });
});
