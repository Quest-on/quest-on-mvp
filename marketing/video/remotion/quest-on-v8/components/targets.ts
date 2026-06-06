// Target generators for the v8 particle field.
//
// Every function returns an array of length N (= V8_PARTICLE_COUNT).
// Particle identity is preserved across calls: the i-th element is
// always "the same particle" — only its position/color/alpha changes
// per target. That stability is what makes the cross-target morph in
// <ParticleField> coherent.
//
// We use a tiny seeded PRNG (mulberry32) so positions are deterministic
// across renders / processes / browsers — Remotion still rendering and
// Chrome still rendering must agree pixel-perfect or the film
// double-exposes during render-checks.

import { V8_PALETTE, V8_PARTICLE_COUNT, V8_WIDTH, V8_HEIGHT } from "../data";

export interface ParticleTarget {
  x: number; // px @ 1920×1080
  y: number;
  r: number; // particle radius in px (default ~1.6)
  alpha: number; // 0..1
  color: string; // hex or rgba
}

// ---------- seeded PRNG -----------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- helpers ---------------------------------------------------
const N = V8_PARTICLE_COUNT;
const CX = V8_WIDTH / 2;
const CY = V8_HEIGHT / 2;

function emptyArr(): ParticleTarget[] {
  const out: ParticleTarget[] = new Array(N);
  for (let i = 0; i < N; i++) {
    out[i] = { x: CX, y: CY, r: 1.6, alpha: 0, color: V8_PALETTE.primary };
  }
  return out;
}

// ---------- 1. drifting field (full-frame cobalt scatter) -------------
// `density` 0..1 → fraction of the N particles that are visible. Hidden
// particles still get a position (for the morph) but alpha = 0.
//
// `falloff` 0..1 — when > 0, particles further from center get dimmer.
// 0 = uniform (pure starfield). 0.6 = soft vignette. Higher = tighter
// cluster.
export function driftingField(opts: {
  density: number; // 0..1
  seed?: number;
  // Constrain to a margin within the frame.
  margin?: number;
  falloff?: number; // 0..1
  // Optional center bias — shift the brightest cluster off-center.
  cx?: number;
  cy?: number;
}): ParticleTarget[] {
  const {
    density,
    seed = 1,
    margin = 80,
    falloff = 0,
    cx = V8_WIDTH / 2,
    cy = V8_HEIGHT / 2,
  } = opts;
  const rand = mulberry32(seed);
  const arr = emptyArr();
  const visible = Math.floor(N * Math.max(0, Math.min(1, density)));
  const maxDist = Math.hypot(V8_WIDTH / 2, V8_HEIGHT / 2);
  for (let i = 0; i < N; i++) {
    const x = margin + rand() * (V8_WIDTH - 2 * margin);
    const y = margin + rand() * (V8_HEIGHT - 2 * margin);
    let alpha = i < visible ? 0.3 + rand() * 0.55 : 0;
    if (alpha > 0 && falloff > 0) {
      const d = Math.hypot(x - cx, y - cy) / maxDist;
      alpha *= 1 - falloff * d;
    }
    arr[i] = {
      x,
      y,
      r: 2.0 + rand() * 1.0,
      alpha: Math.max(0, alpha * 1.55),
      color: V8_PALETTE.primary,
    };
  }
  return arr;
}

// ---------- 2. cube cluster -------------------------------------------
// `density` 'opaque' = packed tight grid (cube reads as a solid black
// box made of cobalt particles). 'dilated' = same square footprint with
// dimmed interior + crisp edge band. 'shell' = particles only along the
// edge band, hollow inside.
//
// Tip-of-the-iceberg detail: top-left is rendered slightly brighter to
// imply a soft top-light direction — the cube reads as a "mass" not a
// patch of noise.
export function cubeCluster(opts: {
  size: number; // half-extent in px
  cx?: number;
  cy?: number;
  density?: "opaque" | "dilated" | "shell";
  interiorGraph?: boolean;
  seed?: number;
}): ParticleTarget[] {
  const {
    size,
    cx = CX,
    cy = CY,
    density = "opaque",
    interiorGraph = false,
    seed = 7,
  } = opts;
  const rand = mulberry32(seed);
  const arr = emptyArr();

  // For "opaque" mode we use a near-grid with jitter to avoid streaks.
  // The grid resolution depends on N + cube size.
  const gridSide = Math.ceil(Math.sqrt(N)); // ~64 for N=4000
  const cell = (size * 2) / gridSide;

  for (let i = 0; i < N; i++) {
    let x = cx;
    let y = cy;
    let alpha = 0;
    let color: string = V8_PALETTE.primary;
    let r = 1.6 + rand() * 0.6;
    let fx = 0;
    let fy = 0;

    if (density === "opaque") {
      // Grid sample — jittered. Eliminates the random-noise look.
      const ix = i % gridSide;
      const iy = Math.floor(i / gridSide);
      x = cx - size + (ix + 0.5) * cell + (rand() - 0.5) * cell * 0.55;
      y = cy - size + (iy + 0.5) * cell + (rand() - 0.5) * cell * 0.55;
      fx = (x - cx) / size;
      fy = (y - cy) / size;
      // Soft top-left bias to imply a single light source.
      const lit = -fx * 0.22 - fy * 0.26;
      alpha = Math.max(
        0.75,
        Math.min(1.0, 0.92 + lit + (rand() - 0.5) * 0.04),
      );
      r = 2.4 + rand() * 0.6; // bigger so the "mass" reads
    } else if (density === "shell") {
      const u = rand();
      const v = rand();
      fx = (u - 0.5) * 2;
      fy = (v - 0.5) * 2;
      const m = Math.max(Math.abs(fx), Math.abs(fy));
      if (m < 0.78) {
        alpha = 0;
      } else {
        const scale = (0.88 + rand() * 0.14) / Math.max(m, 0.001);
        x = cx + fx * size * scale;
        y = cy + fy * size * scale;
        alpha = 0.7 + rand() * 0.3;
        r = 2.2 + rand() * 0.6;
      }
    } else if (density === "dilated") {
      // Same grid layout as opaque, but interior is dim and edges are
      // bright — reads as a glass cube outline with content inside.
      const ix = i % gridSide;
      const iy = Math.floor(i / gridSide);
      x = cx - size + (ix + 0.5) * cell + (rand() - 0.5) * cell * 0.7;
      y = cy - size + (iy + 0.5) * cell + (rand() - 0.5) * cell * 0.7;
      fx = (x - cx) / size;
      fy = (y - cy) / size;
      const m = Math.max(Math.abs(fx), Math.abs(fy));
      if (m > 0.86) {
        // bright crisp edge
        alpha = 0.85 + rand() * 0.15;
        r = 2.4 + rand() * 0.5;
      } else if (interiorGraph && i % 28 === 0) {
        // graph nodes (cobalt highlight) at semi-fixed cells
        alpha = 1.0;
        color = V8_PALETTE.highlight;
        r = 3.0 + rand() * 0.6;
      } else if (interiorGraph && i % 28 < 4) {
        // graph edge stipple
        alpha = 0.4 + rand() * 0.25;
        color = V8_PALETTE.highlight;
        r = 1.6 + rand() * 0.4;
      } else {
        // dim interior fill
        alpha = 0.18 + rand() * 0.12;
        r = 1.6 + rand() * 0.4;
      }
    }
    arr[i] = { x, y, r, alpha, color };
  }
  return arr;
}

// ---------- 3. thought graph (sparse cobalt-highlight nodes + edges) --
// Returns particles arranged as a small graph in the cube center.
// nodeCount nodes are explicit; the rest are short edge stippling.
//
// Also exposes computeThoughtGraphNodes() so the caller can render
// explicit edges as thin <line>s sharing the same coordinate system.
export interface ThoughtGraphNode {
  x: number;
  y: number;
}

export function computeThoughtGraphNodes(opts: {
  cx?: number;
  cy?: number;
  spread: number;
  nodeCount?: number;
  seed?: number;
}): ThoughtGraphNode[] {
  const { cx = CX, cy = CY, spread, nodeCount = 7, seed = 12 } = opts;
  const rand = mulberry32(seed);
  const out: ThoughtGraphNode[] = [];
  for (let n = 0; n < nodeCount; n++) {
    const angle = (n / nodeCount) * Math.PI * 2 + rand() * 0.4;
    const radius = spread * (0.35 + rand() * 0.55);
    out.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 0.65,
    });
  }
  return out;
}

// Picks ~8-12 edges connecting nearest neighbors; deterministic per seed.
export function computeThoughtGraphEdges(
  nodes: ThoughtGraphNode[],
  seed = 12,
): { a: number; b: number }[] {
  const rand = mulberry32(seed * 7 + 13);
  const edges: { a: number; b: number }[] = [];
  const seen = new Set<string>();
  // Each node connects to its 2 nearest neighbors (by index, deterministic).
  for (let i = 0; i < nodes.length; i++) {
    const dists = nodes
      .map((n, j) => ({
        j,
        d: i === j ? Infinity : Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y),
      }))
      .sort((p, q) => p.d - q.d);
    for (let k = 0; k < 2; k++) {
      const j = dists[k].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: Math.min(i, j), b: Math.max(i, j) });
    }
  }
  // 1-2 cross edges for visual richness (deterministic via rand).
  for (let extra = 0; extra < 2; extra++) {
    const a = Math.floor(rand() * nodes.length);
    let b = Math.floor(rand() * nodes.length);
    if (b === a) b = (b + 1) % nodes.length;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!seen.has(key)) {
      seen.add(key);
      edges.push({ a: Math.min(a, b), b: Math.max(a, b) });
    }
  }
  return edges;
}

export function thoughtGraph(opts: {
  cx?: number;
  cy?: number;
  spread: number; // half-extent
  nodeCount?: number;
  seed?: number;
}): ParticleTarget[] {
  const { cx = CX, cy = CY, spread, nodeCount = 7, seed = 12 } = opts;
  const rand = mulberry32(seed);
  const arr = emptyArr();

  // 1. place nodes (must match computeThoughtGraphNodes for the same opts)
  const nodes: { x: number; y: number }[] = [];
  for (let n = 0; n < nodeCount; n++) {
    const angle = (n / nodeCount) * Math.PI * 2 + rand() * 0.4;
    const radius = spread * (0.35 + rand() * 0.55);
    nodes.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 0.65, // squish y for "above" perspective
    });
  }

  // Distribute particles:
  //   slot 0-3   (4%)  node clusters (highlight)
  //   slot 4-29  (26%) edge stipple (highlight, dim)
  //   slot 30-32 (3%)  corner brackets (primary, very bright)
  //   slot 33-99 (67%) interior fill at cube grid (dim primary)
  const cubeSize = spread * 1.55;
  const gridSide = Math.ceil(Math.sqrt(N));
  const cell = (cubeSize * 2) / gridSide;
  for (let i = 0; i < N; i++) {
    const slot = i % 100;
    if (slot < 4) {
      // node halo — small, tight, around a single point
      const node = nodes[i % nodeCount];
      const angle = rand() * Math.PI * 2;
      const radius = rand() * 6;
      arr[i] = {
        x: node.x + Math.cos(angle) * radius,
        y: node.y + Math.sin(angle) * radius,
        r: 2.6 + rand() * 0.6,
        alpha: 0.95 + rand() * 0.05,
        color: V8_PALETTE.highlight,
      };
    } else if (slot < 30) {
      // edge stipple — thin dotted lines between nodes
      const aIdx = Math.floor(rand() * nodeCount);
      let bIdx = Math.floor(rand() * nodeCount);
      if (bIdx === aIdx) bIdx = (bIdx + 1) % nodeCount;
      const a = nodes[aIdx];
      const b = nodes[bIdx];
      const t = rand();
      arr[i] = {
        x: a.x + (b.x - a.x) * t + (rand() - 0.5) * 3,
        y: a.y + (b.y - a.y) * t + (rand() - 0.5) * 3,
        r: 1.2 + rand() * 0.4,
        alpha: 0.5 + rand() * 0.3,
        color: V8_PALETTE.highlight,
      };
    } else if (slot < 33) {
      // 4 corner brackets — bright cobalt L-shapes ~80px in length
      const cornerIdx = i % 4;
      const sx = cornerIdx === 0 || cornerIdx === 3 ? -1 : 1; // L,R
      const sy = cornerIdx === 0 || cornerIdx === 1 ? -1 : 1; // T,B
      // Choose horizontal or vertical leg
      const onHoriz = rand() < 0.5;
      const legPos = rand() * 80;
      const cxL = cx + sx * cubeSize;
      const cyL = cy + sy * cubeSize;
      const px = onHoriz ? cxL - sx * legPos : cxL;
      const py = onHoriz ? cyL : cyL - sy * legPos;
      arr[i] = {
        x: px,
        y: py,
        r: 2.6 + rand() * 0.6,
        alpha: 0.96 + rand() * 0.04,
        color: V8_PALETTE.primary,
      };
    } else {
      // interior fill — dim cobalt grid forms the "glass" volume
      const ix = i % gridSide;
      const iy = Math.floor(i / gridSide);
      const px =
        cx - cubeSize + (ix + 0.5) * cell + (rand() - 0.5) * cell * 0.7;
      const py =
        cy - cubeSize + (iy + 0.5) * cell + (rand() - 0.5) * cell * 0.7;
      const fx = (px - cx) / cubeSize;
      const fy = (py - cy) / cubeSize;
      const m = Math.max(Math.abs(fx), Math.abs(fy));
      // Skip particles that fall on top of the central graph area.
      const distToCenter = Math.hypot(px - cx, py - cy);
      if (distToCenter < spread * 0.65) {
        // fade interior so the graph reads
        arr[i] = {
          x: px,
          y: py,
          r: 1.2,
          alpha: 0.03 + rand() * 0.04,
          color: V8_PALETTE.primary,
        };
      } else if (m > 0.92) {
        // outer edge band — bright (the cube wall)
        arr[i] = {
          x: px,
          y: py,
          r: 2.0 + rand() * 0.5,
          alpha: 0.55 + rand() * 0.35,
          color: V8_PALETTE.primary,
        };
      } else {
        // mid volume — dim
        arr[i] = {
          x: px,
          y: py,
          r: 1.4 + rand() * 0.3,
          alpha: 0.12 + rand() * 0.08,
          color: V8_PALETTE.primary,
        };
      }
    }
  }
  return arr;
}

// ---------- 4. logo Q (Quest-On Q-glyph only — no sparkle) ------------
// Brief C.6.9: no emoji, no sparkle icons in the visible frame. The
// original qstn_logo includes a 4-point sparkle ornament; v8 strips it.
// Particles distribute as: 80% Q ring, 20% tail. Two cobalts only.
//
// scale = 1.0 → ~480px tall; the held logo at cut 17 uses scale ~0.55.
export function logoQuest(opts: {
  cx?: number;
  cy?: number;
  scale?: number;
  seed?: number;
}): ParticleTarget[] {
  const { cx = CX, cy = CY, scale = 1.0, seed = 33 } = opts;
  const rand = mulberry32(seed);
  const arr = emptyArr();

  // dimensions tuned to the qstn_logo viewBox (988×1040, Q ≈ 460u radius)
  const Rq = 220 * scale; // outer radius of Q ring
  const Rqi = 130 * scale; // inner radius of Q ring
  const tailLen = 160 * scale;

  for (let i = 0; i < N; i++) {
    const slot = i % 100;
    if (slot < 80) {
      // Q ring — sample the annulus between Rqi and Rq, with a small
      // notch (~30°) carved out for the tail.
      let angle = rand() * Math.PI * 2;
      // Notch around angle ∈ (0.5, 0.95) rad → roughly 5 o'clock.
      let attempts = 0;
      while (angle > 0.5 && angle < 0.95 && attempts < 6) {
        angle = rand() * Math.PI * 2;
        attempts++;
      }
      const radius = Rqi + rand() * (Rq - Rqi);
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      // Two-cobalt gradient: top-left = highlight, bottom-right = primary.
      const t = ((px - cx) / Rq + (py - cy) / Rq) / 2 + 0.5; // 0..1
      const useHighlight = t < 0.5 + (rand() - 0.5) * 0.18;
      arr[i] = {
        x: px,
        y: py,
        r: 1.7 + rand() * 0.5,
        alpha: 0.85 + rand() * 0.15,
        color: useHighlight ? V8_PALETTE.highlight : V8_PALETTE.primary,
      };
    } else {
      // Tail — straight diagonal from Q's lower-right outward toward
      // the bottom-right corner.
      const t = rand();
      const ax = cx + Math.cos(0.72) * Rq * 0.96;
      const ay = cy + Math.sin(0.72) * Rq * 0.96;
      const bx = ax + tailLen * 0.95;
      const by = ay + tailLen * 0.65;
      arr[i] = {
        x: ax + (bx - ax) * t + (rand() - 0.5) * 5 * scale,
        y: ay + (by - ay) * t + (rand() - 0.5) * 5 * scale,
        r: 1.8 + rand() * 0.4,
        alpha: 0.88 + rand() * 0.1,
        color: V8_PALETTE.primary,
      };
    }
  }
  return arr;
}

// ---------- 5. spiral ------------------------------------------------
// Used in cut 16 — particles rotate inward toward a Q center.
export function spiralToward(opts: {
  cx?: number;
  cy?: number;
  maxRadius?: number;
  turns?: number;
  seed?: number;
}): ParticleTarget[] {
  const {
    cx = CX,
    cy = CY,
    maxRadius = 700,
    turns = 2.4,
    seed = 41,
  } = opts;
  const rand = mulberry32(seed);
  const arr = emptyArr();

  for (let i = 0; i < N; i++) {
    const t = i / N;
    const angle = t * Math.PI * 2 * turns + rand() * 0.6;
    const radius = (1 - t) * maxRadius * (0.6 + rand() * 0.5);
    arr[i] = {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      r: 2.0 + rand() * 0.8,
      alpha: 0.7 + rand() * 0.3,
      color: V8_PALETTE.primary,
    };
  }
  return arr;
}

// ---------- 6. word-shape (full-screen typography backplate) ----------
// For cut 20 — a soft halo behind the two-line title. Particles drift
// loosely across the full frame with a gentle horizontal-band density
// preference, no hard rectangular boundary.
export function copyHalo(opts: { seed?: number }): ParticleTarget[] {
  const { seed = 55 } = opts;
  const rand = mulberry32(seed);
  const arr = emptyArr();

  for (let i = 0; i < N; i++) {
    // Full-frame distribution.
    const x = 60 + rand() * (V8_WIDTH - 120);
    const y = 60 + rand() * (V8_HEIGHT - 120);
    // Distance from the central horizontal band (y ≈ CY).
    const dy = Math.abs(y - CY) / (V8_HEIGHT / 2); // 0..1
    // Brighter near the band, falling off softly to top/bottom.
    const bandWeight = Math.max(0, 1 - Math.pow(dy, 0.7) * 1.1);
    const alpha = 0.1 + bandWeight * 0.4 + rand() * 0.06;
    // 8% highlight, biased toward the lower band (where "과정" lives).
    const isHighlight = y > CY && rand() < 0.08;
    arr[i] = {
      x,
      y,
      r: 1.2 + rand() * 0.5,
      alpha,
      color: isHighlight ? V8_PALETTE.highlight : V8_PALETTE.primary,
    };
  }
  return arr;
}

// ---------- 6b. orbit nebula -----------------------------------------
// Variation cousin of driftingField for cut 14: same density envelope,
// but particles arrange on concentric elliptical orbits around an
// invisible center, with a depth-stratified foreground/background split
// (closer particles brighter+larger). Reads as a slow nebula instead of
// flat starfield. Same engine, different shape.
export function orbitNebula(opts: {
  cx?: number;
  cy?: number;
  maxRadius?: number;
  seed?: number;
}): ParticleTarget[] {
  const {
    cx = CX,
    cy = CY,
    maxRadius = 760,
    seed = 71,
  } = opts;
  const rand = mulberry32(seed);
  const arr = emptyArr();
  for (let i = 0; i < N; i++) {
    // Three depth strata: 35% near, 40% mid, 25% far.
    const depthRoll = rand();
    let depthBand: number;
    if (depthRoll < 0.35) depthBand = 0.35; // near (small radius)
    else if (depthRoll < 0.75) depthBand = 0.65; // mid
    else depthBand = 1.0; // far (full radius)
    const baseR = maxRadius * depthBand * (0.55 + rand() * 0.45);
    // Elliptical squish vertically for "above" perspective.
    const ang = rand() * Math.PI * 2;
    const x = cx + Math.cos(ang) * baseR;
    const y = cy + Math.sin(ang) * baseR * 0.62;
    // Foreground = brighter + bigger; background = dim + small.
    const fgFactor = 1 - depthBand * 0.65;
    const alpha = 0.32 + fgFactor * 0.65 + rand() * 0.1;
    const r = 1.5 + fgFactor * 1.8 + rand() * 0.5;
    // Skip low-alpha occasional ones to prevent uniform fill.
    arr[i] = {
      x,
      y,
      r,
      alpha,
      color: V8_PALETTE.primary,
    };
  }
  return arr;
}

// ---------- 6c. wave ribbon ------------------------------------------
// Topographic sweep — particles arranged on a sine-wave terrain ribbon
// crossing the frame diagonally, brightest at the wave crest.
// Same engine; this is the "wave/terrain" composition the brief A.3
// morph chain calls for as variation evidence.
export function waveRibbon(opts: {
  cy?: number;
  amplitude?: number;
  frequency?: number;
  seed?: number;
}): ParticleTarget[] {
  const {
    cy = CY,
    amplitude = 220,
    frequency = 1.7,
    seed = 91,
  } = opts;
  const rand = mulberry32(seed);
  const arr = emptyArr();
  for (let i = 0; i < N; i++) {
    // Distribute uniformly in x across the frame.
    const t = i / N;
    const xBase = 80 + t * (V8_WIDTH - 160);
    // Sine wave centered on cy.
    const phase = (xBase / V8_WIDTH) * Math.PI * 2 * frequency;
    const yWave = cy + Math.sin(phase) * amplitude;
    // Vertical thickness band — particles distributed within ±band of wave.
    const band = 90 + rand() * 90;
    const yJitter = (rand() - 0.5) * 2 * band;
    const y = yWave + yJitter;
    // Brightness falls off with distance from wave centerline.
    const dy = Math.abs(yJitter) / band;
    const alpha = 0.45 + (1 - dy) * 0.55 + rand() * 0.08;
    // Occasional horizontal jitter for organic feel.
    const x = xBase + (rand() - 0.5) * 6;
    // Right-side bloom: particles toward right edge are noticeably brighter
    // (matches reference ref08 brightening).
    const rightBloom = Math.max(0, (xBase / V8_WIDTH - 0.55) * 0.7);
    arr[i] = {
      x,
      y,
      r: 1.9 + rand() * 0.8 + rightBloom * 0.9,
      alpha: Math.min(1, alpha + rightBloom * 0.3),
      color: V8_PALETTE.primary,
    };
  }
  return arr;
}

// ---------- 7. void (everyone collapses to origin, alpha 0) ------------
export function voidTarget(): ParticleTarget[] {
  const arr = emptyArr();
  for (let i = 0; i < N; i++) {
    arr[i] = {
      x: CX,
      y: CY,
      r: 1.0,
      alpha: 0,
      color: V8_PALETTE.primary,
    };
  }
  return arr;
}
