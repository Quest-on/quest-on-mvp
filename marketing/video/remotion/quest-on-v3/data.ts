// Quest-On Demo v3 — 18 short cuts, 60s total @ 30fps = 1800 frames.
// Reference: .omc/research/storyboard-v3.md §2.

export const V3_FPS = 30;
export const V3_WIDTH = 1920;
export const V3_HEIGHT = 1080;

// Total spec length is 1800f (60s). TransitionSeries overlap on cuts 9->10,
// 12->13, 16->17 (8f each = 24f). Effective composition length = 1800 - 24 = 1776f.
export const V3_TOTAL_FRAMES = 1776;

// Per-cut duration in frames. Sum of values = 1800f.
// Order matches cut numbering 1..18 in storyboard §2.
export const CUT_DURATIONS = [
  45, // 1: 1.5s — pulsing point
  60, // 2: 2.0s — particle burst -> cube crystallize
  75, // 3: 2.5s — cube + hand silhouette + key pulse
  75, // 4: 2.5s — text stream + "AI를 쓴다."
  45, // 5: 1.5s — cube closes (graphite paint)
  90, // 6: 3.0s — pull-out, multi cube grid
  60, // 7: 2.0s — close-up + "보이지 않는다."
  90, // 8: 3.0s — organic crack starts
  75, // 9: 2.5s — crack 60% + light leak
  75, // 10: 2.5s — instructor POV + hand looks in
  75, // 11: 2.5s — graphite -> glass + "그래서…"
  105, // 12: 3.5s — glass 70% + thought trajectory
  90, // 13: 3.0s — camera through glass dive
  90, // 14: 3.0s — interior constellation
  90, // 15: 3.0s — timeline horizontal + "보이게 한다."
  120, // 16: 4.0s — particle wordmark formation
  180, // 17: 6.0s — wordmark hold "Quest-On"
  360, // 18: 12.0s — sub-copy hold + breathing
] as const;

// Transition overlaps (TransitionSeries fade) — only on Reveal beats.
export const TRANSITION_OVERLAP = {
  cut9To10: 8, // crack -> hand POV cross dissolve
  cut12To13: 8, // glass -> dive (white flash inside cut13)
  cut16To17: 8, // particle morph -> wordmark stroke
} as const;

// Copy register. Word-level stagger only (no per-character).
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

// Re-used from glassbox prior work. Sense-making fragments only.
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

// Code-editor flavoured stream lines (mix of EN / KR)
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
