// Quest-On Demo v6 — fixes v5 PNG-mockup issues + 존댓말 통일 + 학생/강사 도메인 명시.
// Same 21-cut spine as v5 (1734 active frames after overlap), but:
//   - all PNG <Img> usage replaced with inline JSX UI mocks (StudentExamMock etc).
//   - copy converted to "-ㅂ니다" honorific register.
//   - DomainLabel placed at Cut 3 (학생) and Cut 10 (강사) for B2B clarity.

export const V6_FPS = 30;
export const V6_WIDTH = 1920;
export const V6_HEIGHT = 1080;

// Per-cut durations (frames @ 30fps). Identical to v5 — preserves timing across the
// 21-cut spine; only motion content + copy changes.
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
  60, // 21: 2.0s — outro fade — wordmark + url breathing
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

// SUM_DURATIONS = 1770, TOTAL_OVERLAP = 36 -> 1734 frames (~57.8s).
export const V6_TOTAL_FRAMES = SUM_DURATIONS - TOTAL_OVERLAP;

// Copy register — kinetic, word-level stagger. All 종결어미 unified to "-ㅂ니다".
export const COPY = {
  cut4: { words: ["모두", "AI를", "씁니다."], fontSize: 64, weight: 700 },
  cut7: { words: ["보이지", "않습니다."], fontSize: 88, weight: 700 },
  cut11: { words: ["그래서…"], fontSize: 56, weight: 600 },
  cut15: {
    words: ["보이게", "합니다."],
    fontSize: 88,
    weight: 700,
    gradient: true,
  },
  cut17: { words: ["Quest-On"], fontSize: 140, weight: 700 },
  cut18: { words: ["사고 과정을 봅니다."], fontSize: 32, weight: 500 },
  cut20: {
    words: ["결과보다,", "과정입니다."],
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
