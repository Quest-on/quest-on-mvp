// Scene durations in frames @ 30fps. Sum = 1700f.
// Effective composition length after TransitionSeries overlap (8+8+2 = 18f) = 1682f.
export const GLASSBOX_DURATIONS = {
  void: 420, // 14s
  fracture: 360, // 12s
  crystallize: 540, // 18s
  constellation: 380, // 12.7s
} as const;

// Transition overlaps. All match-cut on box.
export const GLASSBOX_TRANSITIONS = {
  voidToFracture: 8,
  fractureToCrystallize: 8,
  crystallizeToConstellation: 2,
} as const;

// 1700 - (8+8+2) = 1682
export const GLASSBOX_TOTAL_FRAMES = 1682;

export const GLASSBOX_FPS = 30;
export const GLASSBOX_WIDTH = 1920;
export const GLASSBOX_HEIGHT = 1080;

// Korean copy. 38 chars total (excluding wordmark).
export const GLASSBOX_COPY = {
  void: "모두가 AI를 쓴다.",
  fracture: "보이지 않는다.",
  crystallize: { line1: "사고는,", line2: "보이게." },
  constellation: { wordmark: "Quest-On", subline: "사고 과정이 보이는 평가" },
} as const;

// Scene 3 floating thought fragments — sense-making artefacts, NOT cheating words.
export const THOUGHT_FRAGMENTS = [
  "왜?",
  "근거?",
  "수정 v2",
  "다시 보면…",
  "비교 기준",
  "이 부분은…",
  "다른 관점",
  "v3 최종",
] as const;
