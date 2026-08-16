import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 상태색 역할 토큰 (#203 T2-a)
 *
 * `destructive` 는 있었지만 `success`/`warning`/`info` 가 없어서 amber·green·blue
 * 393건을 옮길 수 없었다. 이 파일이 그 토큰을 고정한다.
 *
 * **단일 토큰으로 접지 않는다.** 현재 화면은 한 의미 안에서도 명도 ramp 를 쓴다
 * (예: 경고 배너가 amber-50 배경 + amber-200 테두리 + amber-800 텍스트).
 * 하나로 합치면 화면이 바뀌므로 역할별로 나눈다.
 *
 *   surface  연한 배경(50)      subtle  보조 배경(100)
 *   border   테두리(200)        solid   아이콘·강조(500/600)
 *   text     본문 텍스트(800/900)
 *
 * 값은 지금 쓰이는 Tailwind 색을 그대로 옮긴 것이다. 재설계가 아니라 보존이
 * 목적이라 치환해도 픽셀이 안 바뀐다.
 */

const CSS = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

const ROLES = ["success", "warning", "info"] as const;
const SLOTS = ["surface", "subtle", "border", "solid", "text"] as const;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** `:root`(라이트) / `.dark` 블록에서 토큰 값을 읽는다. */
function readToken(token: string, theme: "light" | "dark"): [number, number, number] {
  const all = [
    ...CSS.matchAll(
      new RegExp(`--${token}:\\s*hsl\\(([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\)`, "g")
    ),
  ];
  // 정의 순서: :root 가 먼저, .dark 가 나중.
  const m = theme === "light" ? all[0] : all[all.length - 1];
  expect(m, `--${token} (${theme}) 정의를 못 찾았다`).toBeTruthy();
  return hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]));
}

describe("상태색 토큰이 라이트·다크 양쪽에 정의된다", () => {
  it.each(ROLES)("%s 의 5개 역할이 모두 있다", (role) => {
    for (const slot of SLOTS) {
      const defs = CSS.match(new RegExp(`--${role}-${slot}:`, "g")) ?? [];
      // 라이트 + 다크 = 최소 2회.
      expect(defs.length, `--${role}-${slot}`).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(ROLES)("%s 가 Tailwind 유틸리티로 노출된다", (role) => {
    // @theme inline 매핑이 없으면 bg-success-surface 같은 클래스가 안 생긴다.
    for (const slot of SLOTS) {
      expect(CSS).toMatch(
        new RegExp(`--color-${role}-${slot}:\\s*var\\(--${role}-${slot}\\)`)
      );
    }
  });
});

describe("본문 대비가 WCAG AA 를 만족한다", () => {
  // 규칙: 본문 텍스트는 4.5:1 이상.
  it.each(ROLES)("라이트 — %s text on surface", (role) => {
    const ratio = contrast(
      readToken(`${role}-text`, "light"),
      readToken(`${role}-surface`, "light")
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ROLES)("라이트 — %s text on white", (role) => {
    const ratio = contrast(readToken(`${role}-text`, "light"), [1, 1, 1]);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ROLES)("다크 — %s text on surface", (role) => {
    const ratio = contrast(
      readToken(`${role}-text`, "dark"),
      readToken(`${role}-surface`, "dark")
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("현재 렌더링을 보존한다", () => {
  /** 지금 화면이 쓰는 Tailwind 색의 실제 RGB. */
  const TAILWIND: Record<string, [number, number, number]> = {
    "success-surface": [236, 253, 245], // emerald-50
    "success-subtle": [209, 250, 229], // emerald-100
    "success-border": [167, 243, 208], // emerald-200
    "success-solid": [16, 185, 129], // emerald-500
    "success-text": [6, 95, 70], // emerald-800
    "warning-surface": [255, 251, 235], // amber-50
    "warning-subtle": [254, 243, 199], // amber-100
    "warning-border": [253, 230, 138], // amber-200
    "warning-solid": [245, 158, 11], // amber-500
    "warning-text": [120, 53, 15], // amber-900
    "info-surface": [239, 246, 255], // blue-50
    "info-subtle": [219, 234, 254], // blue-100
    "info-border": [191, 219, 254], // blue-200
    "info-solid": [59, 130, 246], // blue-500
    "info-text": [30, 64, 175], // blue-800
  };

  it.each(Object.keys(TAILWIND))("%s 가 기존 색과 같다", (token) => {
    // 재설계가 아니라 보존이다. 치환해도 화면이 안 바뀌어야 한다.
    const [r, g, b] = readToken(token, "light").map((v) => Math.round(v * 255));
    const [tr, tg, tb] = TAILWIND[token];
    const diff = Math.max(Math.abs(r - tr), Math.abs(g - tg), Math.abs(b - tb));

    // 반올림 오차 1/255 까지만 허용한다.
    expect(diff, `${token}: rgb(${r},${g},${b}) vs rgb(${tr},${tg},${tb})`).toBeLessThanOrEqual(1);
  });
});
