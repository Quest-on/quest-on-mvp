import { Easing } from "remotion";

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;
// Total = sum(SCENE_DURATIONS) - sum(transitions). 6 transitions: 5 fade(14) + 1 wipe(22) = 92f.
// 1800 - 92 = 1708 frames ≈ 56.9s. TransitionSeries overlaps each cut, so we subtract.
export const VIDEO_DURATION_FRAMES = 1708;

export const SCENE_DURATIONS = {
  hook: 240, // 8s
  problem: 210, // 7s
  instructor: 330, // 11s
  student: 330, // 11s
  evidence: 240, // 8s
  wow: 270, // 9s — AI grading reveal
  cta: 180, // 6s
} as const;

export const TRANSITION_DURATIONS = {
  fast: 14, // ~0.47s
  normal: 22, // ~0.73s
} as const;

export const COLORS = {
  ink: "#f8fafc",
  inkSoft: "#e2e8f0",
  muted: "#b6c5d6",
  mutedDeep: "#7d8fa3",
  line: "rgba(226,232,240,0.18)",
  lineSoft: "rgba(226,232,240,0.10)",
  bgDeep: "#06111f",
  bgMid: "#0e1728",
  bgSoft: "#111827",
  blue: "#3b82f6",
  cyan: "#22d3ee",
  mint: "#34d399",
  amber: "#fbbf24",
  red: "#fb7185",
  violet: "#a78bfa",
  gradientPrimary: "linear-gradient(90deg, #22d3ee, #34d399)",
  gradientWarm: "linear-gradient(90deg, #a78bfa, #22d3ee)",
} as const;

export const EASING = {
  smoothOut: Easing.bezier(0.22, 1, 0.36, 1), // default tone
  expoOut: Easing.bezier(0.19, 1, 0.22, 1), // snappy
  cubicInOut: Easing.bezier(0.65, 0, 0.35, 1), // mask reveal
  cubicOut: Easing.bezier(0.165, 0.84, 0.44, 1), // smooth presentation
} as const;

// Always pair with useVideoConfig().fps at the call site.
export const SPRINGS = {
  smooth: { damping: 22, stiffness: 100, mass: 1 },
  gentle: { damping: 26, stiffness: 80, mass: 1 },
  snappy: { damping: 18, stiffness: 160, mass: 0.8 },
  bouncy: { damping: 11, stiffness: 160, mass: 1 }, // reserve for Wow moments
} as const;

export const TYPO = {
  fontFamily:
    "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, sans-serif",
  letterSpacingTight: "-0.025em",
  letterSpacingBody: "-0.01em",
  lineHeightTitle: 1.05,
  lineHeightBody: 1.65,
} as const;
