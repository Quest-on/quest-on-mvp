import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const CSS = read("app/globals.css");

/**
 * 시맨틱 토큰으로 옮기다가 대비를 깨뜨렸다.
 *
 * `#204` 구간에서 `text-amber-950 bg-amber-500`(대비 6.97)을
 * `text-warning-text bg-warning-solid`(대비 4.42)로 바꿨다. 둘 다 "경고"라
 * 뜻은 맞는데, `*-text` 는 **밝은 표면 위에 얹는 전경색**이라 진한 solid
 * 배경 위에서는 대비가 모자란다.
 *
 * CI 의 a11y 스펙이 잡았다.
 *   Error: Critical a11y violations on /instructor: color-contrast
 *   insufficient color contrast of 4.42 (foreground #78360f, background #f4a620)
 *
 * 이름이 그럴듯해 보인다고 통과시키지 않는다. 실제 값으로 계산한다.
 */

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** `:root` 블록에서 토큰의 hsl 값을 읽는다. 다크 블록은 보지 않는다. */
function token(name: string): [number, number, number] {
  const light = CSS.slice(0, CSS.indexOf(".dark"));
  const m = new RegExp(`--${name}:\\s*hsl\\(([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\)`).exec(
    light
  );
  if (!m) throw new Error(`토큰 --${name} 를 :root 에서 찾지 못했다`);
  return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

describe("시맨틱 토큰 대비", () => {
  it.each(["warning", "success", "info"])(
    "%s-text 는 밝은 표면용이지 solid 배경용이 아니다",
    (kind) => {
      // 이 단언이 깨지면 *-text 를 solid 위에 얹어도 된다는 뜻이 되어
      // 아래 사용처 검사의 전제가 무너진다. 전제를 먼저 고정한다.
      let solid: [number, number, number];
      try {
        solid = token(`${kind}-solid`);
      } catch {
        return; // solid 토큰이 없는 계열은 검사 대상이 아니다
      }
      const surface = token(`${kind}-surface`);
      const text = token(`${kind}-text`);

      expect(
        contrast(text, surface),
        `${kind}-text on ${kind}-surface 대비가 4.5 미만이다`
      ).toBeGreaterThanOrEqual(4.5);

      // solid 위에서는 모자란다는 걸 명시한다 — 그래서 쓰면 안 된다.
      expect(contrast(text, solid)).toBeLessThan(4.5);
    }
  );

  it("진한 solid 배경 위에 같은 계열 text 를 얹지 않는다", () => {
    const files = execSync("git ls-files components app", { cwd: root, encoding: "utf8" })
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.endsWith(".tsx"));

    const violations: string[] = [];
    for (const f of files) {
      const src = readFileSync(resolve(root, f), "utf8");
      for (const m of src.matchAll(
        /"[^"]*bg-(warning|success|info)-solid(\/(\d+))?[^"]*"/g
      )) {
        const opacity = m[3] ? Number(m[3]) : 100;
        // 옅게 깐 배경(/10 등)은 밝은 표면이라 *-text 가 맞다.
        if (opacity < 50) continue;
        if (new RegExp(`text-${m[1]}-text`).test(m[0])) {
          violations.push(`${f}: ${m[0].slice(0, 70)}`);
        }
      }
    }

    expect(
      violations,
      `대비가 모자란 조합이 있다:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});
