// Quest-On Demo v8 — "particle-field discipline" rebuild.
//
// v8 abandons the multi-material grammar of v6/v7 (wireframe cube +
// glossy glass cube + AE-style constellation + raw PNG of UI + gradient
// logo). Instead, every visible pixel-of-light in the film is one of
// N=4000 cobalt particles whose positions are interpolated between
// per-cut TARGET arrays. Density is the only "shape variable":
// opaque cluster = blackbox, dilated = glassbox.
//
// Hard rules (from the redesign brief):
//   1. ONE primary material — cobalt particle field.
//   2. Two cobalts only: #3559C4 + #57CDFF on #05070F.
//   3. ≤ 5 text events. Korean stagger is word-level only.
//   4. UI screenshots resolve from particles, hold ~1s, dissolve back.
//   5. White is allowed only inside the held UI screenshot frames.
//   6. All motion via useCurrentFrame() — no CSS animation.
//   7. Every interpolate() uses extrapolate{Left,Right}: "clamp".
//   8. The cube metaphor stays — but as a particle DENSITY STATE.

export const V8_FPS = 30;
export const V8_WIDTH = 1920;
export const V8_HEIGHT = 1080;

// 21 cuts at 30fps. Same spine as v6/v7 but the *interior* of every cut is
// now particle-driven.
export const V8_CUT_DURATIONS = [
  45, // 1:  silent — sparse drifting field
  60, // 2:  silent — particles begin condensing
  75, // 3:  silent — cluster forms, hint of cube
  75, // 4:  "모두 AI를 씁니다." (32pt lower-third)
  45, // 5:  cube held, micro-jitter
  90, // 6:  implied dolly, particles drift
  60, // 7:  "보이지 않습니다." (max 48pt)
  90, // 8:  cube fully opaque, isolated in void
  75, // 9:  ★ SIGNATURE — radial dilation, interior thought-graph emerges
  75, // 10: thought-graph rotation, camera implied above
  75, // 11: instructor sees — UI resolves from particles
  105, // 12: instructor grading UI resolves, holds ~1s, dissolves
  90, // 13: UI returns to particles, cube reforms briefly
  90, // 14: low-density particle drift
  90, // 15: particles shimmer
  120, // 16: spiral toward Q center
  120, // 17: funnel into Q-mark; HOLD logo
  120, // 18: logo settles
  120, // 19: student exam UI resolves, holds <=1.8s, dissolves
  90, // 20: "결과보다, 과정입니다." full-screen crescendo
  60, // 21: particles drift apart, fade
] as const;

const SUM_DURATIONS = V8_CUT_DURATIONS.reduce<number>((a, n) => a + n, 0);
// v8 intentionally avoids TransitionSeries; every cut owns a discrete
// Remotion Sequence and the morph target itself carries continuity.
export const V8_TOTAL_FRAMES = SUM_DURATIONS;

// ---- Palette — 3-color budget, behaves like 1-color ----------------
export const V8_PALETTE = {
  bg: "#05070F",
  primary: "#3559C4", // base particle color
  highlight: "#57CDFF", // ≤ 5% — interior thoughts, accent words
} as const;

// ---- Particle engine config -----------------------------------------
export const V8_PARTICLE_COUNT = 4000;
// Default radius in px @ 1080p. Some cuts override.
export const V8_PARTICLE_R = 1.6;
// Default morph window (frames). Targets blend over this many frames
// at the start of the cut, then hold.
export const V8_MORPH_FRAMES = 30;

// ---- Text events — 5 total ------------------------------------------
//   Cut 4: "모두 AI를 씁니다."      lower-third
//   Cut 7: "하지만 과정은 보이지 않습니다." center-low
//   Cut 20: "결과보다, 과정입니다." full-screen crescendo
export const V8_COPY = {
  cut4: { words: ["모두", "AI를", "씁니다."], fontSize: 38, weight: 560 },
  cut7: {
    words: ["하지만", "과정은", "보이지", "않습니다."],
    fontSize: 54,
    weight: 650,
  },
  cut20: { words: ["결과보다,", "과정입니다."], fontSize: 96, weight: 700 },
} as const;
