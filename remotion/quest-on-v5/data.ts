// Quest-On Demo v5 — fixes v4 stalls + uses real product UI screenshots.
// 21 cuts. v4 1..16 retained; v4 17..18 (540f dead block) replaced by 17..21 (510f active).
// Each cut's motion runs 0% -> 100% across its full duration; no hold-only frames.

export const V5_FPS = 30;
export const V5_WIDTH = 1920;
export const V5_HEIGHT = 1080;

// Per-cut durations (frames @ 30fps).
// Cuts 1..16 are unchanged from v4. 17..21 are fresh.
export const CUT_DURATIONS = [
  45, // 1: 1.5s — pulsing cobalt point
  60, // 2: 2.0s — particle burst -> wireframe (V1)
  75, // 3: 2.5s — graphite cube + hand + key pulse
  75, // 4: 2.5s — code stream + "AI를 쓴다."
  45, // 5: 1.5s — V4 exploded blueprint flash
  90, // 6: 3.0s — multi-cube grid pull-out
  60, // 7: 2.0s — push-in + "보이지 않는다."
  90, // 8: 3.0s — V2 black-box + crack starts
  75, // 9: 2.5s — V5 phase wipe (graphite -> glass)
  75, // 10: 2.5s — instructor POV + cross-section
  75, // 11: 2.5s — Real student-exam UI on cube front face + "그래서…"
  105, // 12: 3.5s — Real instructor-grade UI takeover
  90, // 13: 3.0s — UI -> back to cube + V6 iridescent peak
  90, // 14: 3.0s — V8 constellation interior
  90, // 15: 3.0s — timeline + "보이게 한다."
  120, // 16: 4.0s — particle wordmark formation
  120, // 17: 4.0s — Quest-On logo SVG reveal (was 180f) + halo bloom secondary motion
  120, // 18: 4.0s — wordmark "Quest-On" lock-in + sub-copy ladder rise
  120, // 19: 4.0s — UI Montage — 3 real PNGs cycle (~1.33s each)
  90, // 20: 3.0s — "결과보다 사고 과정." kinetic copy w/ gradient
  60, // 21: 2.0s — outro fade — wordmark + url breathing
] as const;

// Transition overlaps. We re-use v4's 24-frame budget (3 fades x 8f) and add
// two extra fades (16->17 reused, 18->19 NEW, 20->21 NEW) at 6f each.
// Total overlap = 3*8 + 2*6 = 36f. Total duration = sum(CUT_DURATIONS) - 36.
const SUM_DURATIONS = CUT_DURATIONS.reduce<number>((acc, n) => acc + n, 0);

export const TRANSITION_OVERLAP = {
  cut9To10: 8,
  cut12To13: 8,
  cut16To17: 8,
  cut18To19: 6,
  cut20To21: 6,
} as const;

const TOTAL_OVERLAP =
  TRANSITION_OVERLAP.cut9To10 +
  TRANSITION_OVERLAP.cut12To13 +
  TRANSITION_OVERLAP.cut16To17 +
  TRANSITION_OVERLAP.cut18To19 +
  TRANSITION_OVERLAP.cut20To21;

// SUM_DURATIONS = 1875, TOTAL_OVERLAP = 36 -> 1839 frames (~61.3s).
export const V5_TOTAL_FRAMES = SUM_DURATIONS - TOTAL_OVERLAP;

// Copy register — kinetic, word-level stagger.
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
  cut20: {
    words: ["결과보다", "사고", "과정."],
    fontSize: 116,
    weight: 800,
    gradient: true,
  },
  cut21: { url: "quest-on.app", urlSize: 28 },
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

// Cube-variant matrix per cut.
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
  11: "real-UI-front",
  12: "real-UI-fullscreen",
  13: "V6",
  14: "V8",
  15: "V8",
  16: "particles",
  17: "logo",
  18: "wordmark",
  19: "real-UI-montage",
  20: "kinetic-copy",
  21: "outro",
} as const;
