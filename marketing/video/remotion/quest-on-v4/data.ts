// Quest-On Demo v4 — abstract metaphor + real product UI fusion.
// 18 cuts, 60s @ 30fps = 1800 spec frames; effective length = 1800 - overlaps.
// Reference: .omc/research/storyboard-v3.md, abstract-to-concrete.md, cube-design-advanced.md.

export const V4_FPS = 30;
export const V4_WIDTH = 1920;
export const V4_HEIGHT = 1080;

// 5 transition overlaps × 8f = 40f. 1800 - 24 = 1776 (matching v3 totals; 24 used overlap budget).
// We keep v3 overlap layout (cuts 9->10, 12->13, 16->17 = 24f) so duration math stays.
export const V4_TOTAL_FRAMES = 1776;

// Per-cut durations — match v3 baseline so audio cues stay aligned.
export const CUT_DURATIONS = [
  45, // 1: 1.5s — pulsing point + cobalt halo
  60, // 2: 2.0s — particle burst -> wireframe (V1) crystallise
  75, // 3: 2.5s — cube + hand silhouette + key pulse
  75, // 4: 2.5s — text stream (Geist Mono) + "AI를 쓴다."
  45, // 5: 1.5s — exploded blueprint (V4) flash, snap back
  90, // 6: 3.0s — pull-out, multi cube grid (each a phase variant)
  60, // 7: 2.0s — close-up + "보이지 않는다."
  90, // 8: 3.0s — black-box w/ inner-text leak (V2) + crack starts
  75, // 9: 2.5s — phase-transition (V5) — black -> glass wipe
  75, // 10: 2.5s — instructor POV + cross-section (V3) reveal
  75, // 11: 2.5s — Surface morph: cube front -> student exam UI (V7) + "그래서…"
  105, // 12: 3.5s — full-screen instructor grade dashboard takeover
  90, // 13: 3.0s — UI -> back to cube, iridescent peak (V6, 1.5s only)
  90, // 14: 3.0s — interior constellation (V8)
  90, // 15: 3.0s — timeline horizontal + "보이게 한다."
  120, // 16: 4.0s — particle wordmark formation
  180, // 17: 6.0s — Quest-On logo SVG reveal
  360, // 18: 12.0s — sub-copy hold + breathing (V9)
] as const;

// Same overlap fingerprint as v3 — keeps total at 1776f.
export const TRANSITION_OVERLAP = {
  cut9To10: 8,
  cut12To13: 8,
  cut16To17: 8,
} as const;

// Copy register. Word-level stagger only; cobalt gradient on key beats.
export const COPY = {
  cut4: { words: ["AI를", "쓴다."], fontSize: 64, weight: 700 },
  cut7: { words: ["보이지", "않는다."], fontSize: 88, weight: 700 },
  cut11: { words: ["그래서…"], fontSize: 56, weight: 600 },
  cut15: {
    words: ["보이게", "한다."],
    fontSize: 88,
    weight: 700,
    gradient: true,
  },
  cut17: { words: ["Quest-On"], fontSize: 140, weight: 700 },
  cut18: { words: ["사고 과정이 보이는 평가"], fontSize: 32, weight: 500 },
} as const;

// Sense-making fragments (re-used inside trajectory + chat preview).
export const THOUGHT_FRAGMENTS = [
  "왜?",
  "근거",
  "수정 v2",
  "다시 보면…",
  "비교 기준",
  "이 부분은…",
  "다른 관점",
  "v3 최종",
] as const;

// Code-editor flavoured stream. Geist Mono rendering enforced at the component.
export const TEXT_STREAM_LINES = [
  "def analyze(case):",
  "  '왜 그렇게 판단했는가'",
  "  ai.assist(...)",
  "그린휠은 경량화 전략으로",
  "// 자료 page 3 참조",
  "AI: 무게 지표 표 4-2",
  "v2 수정 — 비교 기준 변경",
  "근거: 시장 점유율 14%",
  "  return reasoning",
  "if margin < 0.12:",
  "  flag('재검토')",
  "// 다른 관점도 검토",
  "참조 v3 → 최종",
  "왜? -> 그래서?",
  "AI: 인용 page 12",
  "수정안 v3 확정",
] as const;

// Cube-variant matrix per cut (single source of truth).
// V1 wireframe / V2 black-leak / V3 cross-section / V4 exploded /
// V5 phase / V6 iridescent / V7 inside-out POV / V8 constellation / V9 breathing.
export const CUBE_VARIANT_BY_CUT: Record<number, string> = {
  1: "V1",
  2: "V1",
  3: "V1->graphite",
  4: "graphite",
  5: "V4",
  6: "V2-grid",
  7: "graphite",
  8: "V2",
  9: "V5",
  10: "V3",
  11: "V7",
  12: "UI",
  13: "V6",
  14: "V8",
  15: "V8",
  16: "particles",
  17: "logo",
  18: "V9",
} as const;
