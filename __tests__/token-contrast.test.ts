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

/** 테마별 블록에서 토큰의 hsl 값을 읽는다. */
function token(
  name: string,
  mode: "light" | "dark" = "light"
): [number, number, number] {
  const theme = mode;
  const cut = CSS.indexOf(".dark {");
  const blk = theme === "light" ? CSS.slice(0, cut) : CSS.slice(cut, CSS.indexOf("@theme"));
  const re = new RegExp(
    "--" + name + ":\\s*hsl\\(\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*\\)"
  );
  const m = re.exec(blk);
  if (!m) throw new Error(name + " 토큰을 " + theme + " 블록에서 찾지 못했다");
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

  it("solid 배경 위 전경은 두 테마 모두에서 4.5 를 넘는다", () => {
    // solid 는 두 테마에서 명도가 비슷한데 --foreground 는 뒤집힌다.
    // 그래서 text-foreground 를 얹으면 한쪽 테마가 반드시 무너진다.
    // 실제로 다크에서 1.52 까지 떨어뜨린 적이 있다.
    for (const kind of ["success", "warning", "info", "danger"]) {
      let solidL, fgL;
      try { solidL = token(kind + "-solid"); fgL = token(kind + "-solid-foreground"); }
      catch { continue; }
      expect(
        contrast(fgL, solidL),
        kind + "-solid-foreground on " + kind + "-solid (light) 대비 부족"
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("solid 배경에 테마 종속 전경을 얹지 않는다", () => {
    const files = execSync("git ls-files components app", { cwd: root, encoding: "utf8" })
      .split("\n").map((f) => f.trim()).filter((f) => f.endsWith(".tsx"));
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(resolve(root, f), "utf8");
      for (const m of src.matchAll(/"[^"]*"/g)) {
        const cls = m[0];
        if (!/bg-(success|warning|info|danger)-solid(?!-)/.test(cls)) continue;
        if (/bg-(success|warning|info|danger)-solid\/[1-4]?\d(?!\d)/.test(cls)) continue;
        // --foreground 와 *-text 는 둘 다 solid 위에서 무너진다.
        if (/text-foreground\b/.test(cls) || /text-(success|warning|info|danger)-text\b/.test(cls)) {
          bad.push(f + ": " + cls.slice(0, 70));
        }
      }
    }
    expect(bad, "solid 위에 테마 종속 전경을 얹었다:\n" + bad.join("\n")).toHaveLength(0);
  });
});

/**
 * CI a11y 스펙은 /, /student, /instructor 세 라우트만 본다. 색 토큰화는
 * 전 화면을 건드렸으므로 그 바깥에서 난 회귀는 아무도 못 봤다. 코드에서
 * 전수로 계산한다.
 */
describe("전수 대비 검사", () => {
  it("함께 쓰이는 bg/text 조합이 두 테마에서 4.5 를 넘는다", () => {
    const files = execSync("git ls-files components app", { cwd: root, encoding: "utf8" })
      .split("\n").map((f) => f.trim()).filter((f) => f.endsWith(".tsx"));
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(resolve(root, f), "utf8");
      for (const q of src.matchAll(/"[^"]*"/g)) {
        const groups: Record<string, string[]> = {};
        for (const t of q[0].slice(1, -1).split(/\s+/)) {
          const p = t.lastIndexOf(":");
          const pre = p < 0 ? "" : t.slice(0, p + 1);
          (groups[pre] = groups[pre] || []).push(p < 0 ? t : t.slice(p + 1));
        }
        for (const [pre, list] of Object.entries(groups)) {
          // 같은 variant 접두사끼리만 실제로 동시에 적용된다.
          const bg = list.find((x) => x.startsWith("bg-"));
          const tx = list.find((x) => x.startsWith("text-"));
          if (!bg || !tx) continue;
          const bm = /^bg-([a-z-]+?)(\/(\d+))?$/.exec(bg);
          const tm = /^text-([a-z-]+?)(\/(\d+))?$/.exec(tx);
          if (!bm || !tm) continue;
          // 옅게 깐 배경은 표면색이 다르므로 이 검사 대상이 아니다.
          if (bm[3] && Number(bm[3]) < 50) continue;
          for (const mode of ["light", "dark"] as const) {
            if (pre === "dark:" && mode === "light") continue;
            // dark: 오버라이드가 있으면 다크에서는 그쪽이 이긴다.
            if (mode === "dark" && pre === "" && /dark:text-/.test(q[0])) continue;
            let b, t;
            try { b = token(bm[1], mode); t = token(tm[1], mode); } catch { continue; }
            const v = contrast(t, b);
            if (v < 4.5) bad.push();
          }
        }
      }
    }
    expect(bad, ).toHaveLength(0);
  });
});
