// Quest-On Demo v7 — fork of v6 with AI-native streaming UX in Cut 11, 12, 19.
// Spine unchanged (21 cuts, 1734 active frames). v7 deltas:
//   - StudentExamMock: SSE-style chat (typing dots → typewriter LLM reply + answer typing).
//   - InstructorGradeMock: AI 분석 중 → streaming summary → score count-up + rubric bar fill.
//   - white-out fix: mock background tinted #f8fafb + subtle inner border so the cube
//     front face does not blow out during Cut 11 morph.

export const V7_FPS = 30;
export const V7_WIDTH = 1920;
export const V7_HEIGHT = 1080;

// Per-cut durations (frames @ 30fps). The outro is intentionally 90f so the
// Cut21 URL reveal, underline, and clean fade-to-black can complete.
export const CUT_DURATIONS = [
  45, // 1: 1.5s — pulsing cobalt point
  60, // 2: 2.0s — particle burst -> wireframe (V1)
  75, // 3: 2.5s — graphite cube + hand + key pulse + 학생 라벨
  75, // 4: 2.5s — code stream + "모두 AI를 씁니다."
  45, // 5: 1.5s — V4 exploded blueprint flash
  90, // 6: 3.0s — multi-cube grid pull-out
  60, // 7: 2.0s — push-in + "보이지 않습니다."
  90, // 8: 3.0s — V2 black-box + crack starts
  75, // 9: 2.5s — V5 phase wipe (graphite -> glass)
  75, // 10: 2.5s — instructor POV + 강사 라벨
  75, // 11: 2.5s — StudentExamMock on cube front face + "그래서…"
  105, // 12: 3.5s — InstructorGradeMock takeover
  90, // 13: 3.0s — UI -> back to cube + V6 iridescent peak
  90, // 14: 3.0s — V8 constellation interior
  90, // 15: 3.0s — timeline + "보이게 합니다."
  120, // 16: 4.0s — particle wordmark formation
  120, // 17: 4.0s — Quest-On logo SVG reveal + halo bloom secondary motion
  120, // 18: 4.0s — wordmark "Quest-On" lock-in + sub-copy "사고 과정을 봅니다."
  120, // 19: 4.0s — UI Montage — JoinCode / StudentExam / InstructorGrade cycle
  90, // 20: 3.0s — "결과보다, 과정입니다." kinetic copy w/ gradient
  90, // 21: 3.0s — outro fade — wordmark + url breathing CTA
] as const;

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

// SUM_DURATIONS = 1800, TOTAL_OVERLAP = 36 -> 1764 frames (~58.8s).
export const V7_TOTAL_FRAMES = SUM_DURATIONS - TOTAL_OVERLAP;

// Copy register — kinetic, word-level stagger. All 종결어미 unified to "-ㅂ니다".
export const COPY = {
  cut4: { words: ["AI 시대,", "교육은?"], fontSize: 120, weight: 800 },
  cut6: { words: ["과정은", "보이지 않습니다."], fontSize: 96, weight: 700 },
  cut7: { words: ["블랙박스."], fontSize: 140, weight: 800 },
  cut11: { words: ["열어", "봅니다."], fontSize: 96, weight: 700, gradient: true },
  cut15: {
    words: ["사고가", "보입니다."],
    fontSize: 120,
    weight: 700,
    gradient: true,
  },
  cut17: { words: ["Quest-On"], fontSize: 160, weight: 700 },
  cut18: { words: ["사고를 채점합니다."], fontSize: 64, weight: 600 },
  cut20: {
    words: ["답이 아닌,", "사고입니다."],
    fontSize: 140,
    weight: 800,
    gradient: true,
  },
  cut21: { url: "quest-on.app", urlSize: 36 },
} as const;

// version-a-iter1 — VC pitch category caption. Shown frame 12..end of cut 1
// and across cut 2 / start of cut 3 so the first 5 seconds always carry an
// explicit category signal. Bilingual to keep global VCs onboarded.
export const CATEGORY_CAPTION = {
  ko: "AI 시대, 시험의 재발명",
  sub: "사고력 평가 플랫폼",
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
