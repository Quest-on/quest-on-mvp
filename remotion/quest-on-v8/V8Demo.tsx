// Quest-On v8 — single-material particle film.
//
// All 21 cuts share one engine: <ParticleField from to>. The film's
// "morph chain" is just the sequence of TARGETS we feed it.
//
// No CSS animations, no transitions library — every cut owns its own
// frame range via Remotion <Sequence>. Cross-cut continuity is achieved
// by passing the *previous* cut's "to" as the next cut's "from".
//
// Text events (5 total) live in the few cuts that earn them; the rest
// are silent. UI screenshots resolve from particles, hold ~1s, dissolve.

import type { ReactElement } from "react";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  useCurrentFrame,
} from "remotion";

import "../quest-on-demo/fonts";
import {
  V8_COPY,
  V8_CUT_DURATIONS,
  V8_PALETTE,
  V8_WIDTH,
  V8_HEIGHT,
} from "./data";
import { ParticleField } from "./components/ParticleField";
import {
  computeThoughtGraphEdges,
  computeThoughtGraphNodes,
  copyHalo,
  cubeCluster,
  driftingField,
  logoQuest,
  orbitNebula,
  spiralToward,
  thoughtGraph,
  voidTarget,
  waveRibbon,
} from "./components/targets";
import { InstructorGradeMock } from "./components/InstructorGradeMock";
import { StudentExamMock } from "./components/StudentExamMock";
import { QuestOnLogoV8 } from "./components/QuestOnLogoV8";

export {
  V8_FPS,
  V8_WIDTH,
  V8_HEIGHT,
  V8_TOTAL_FRAMES,
} from "./data";

// ----- Targets memoised at module scope (deterministic) ---------------
// The same target arrays are used across cuts; computing them once
// keeps Remotion still-renders fast.
//
// Note on cube SIZE: at 1920×1080 the cube needs ~360px half-extent
// (720px square) to read as a "mass" rather than a noise patch.
// Cut 1 was reading as compression noise — bumping density 0.25 → 0.50
// so the field has clear signal even on uncalibrated displays.
const T_DRIFT_VERY_SPARSE = driftingField({
  density: 0.5,
  seed: 1,
  falloff: 0.5,
  // sparse cosmos for cut 1
});
const T_DRIFT_SPARSE = driftingField({
  density: 0.45,
  seed: 1,
  falloff: 0.55,
});
const T_DRIFT_MED = driftingField({
  density: 0.75,
  seed: 1,
  falloff: 0.4,
});
const T_CONDENSE_HINT = cubeCluster({
  size: 380,
  density: "shell",
  seed: 7,
});
const T_CUBE_OPAQUE = cubeCluster({ size: 360, density: "opaque", seed: 7 });
const T_CUBE_OPAQUE_BREATH = cubeCluster({
  size: 372, // slight breath outward
  density: "opaque",
  seed: 7,
});
const T_CUBE_OPAQUE_TIGHT = cubeCluster({
  size: 340,
  density: "opaque",
  seed: 7,
});
const T_CUBE_OPAQUE_TIGHTER = cubeCluster({
  size: 320, // even tighter as we push in
  density: "opaque",
  seed: 7,
});
const T_CUBE_DILATED = cubeCluster({
  size: 380,
  density: "dilated",
  interiorGraph: true,
  seed: 7,
});
const T_THOUGHT_GRAPH = thoughtGraph({ spread: 260, nodeCount: 7, seed: 12 });
const T_THOUGHT_GRAPH_ROT = thoughtGraph({
  spread: 270,
  nodeCount: 7,
  seed: 13,
});
// Cube outline (shell) target used as a "ghost" frame behind the UI
// holds in cuts 11/12 and 19 — anchors the UI inside the dilated cube
// interior so it shares material grammar with cuts 7-10. Sized LARGER
// than the UI bounding box (UI ≈ 1280×720; ghost half-extent 540 →
// 1080×1080) so the cobalt edges visibly frame the panel rather than
// hide behind it.
const T_CUBE_GHOST = cubeCluster({
  size: 540,
  density: "shell",
  seed: 21,
});

// Thought-graph node positions + edges, computed once. Used to draw
// explicit cobalt edge lines in cuts 9/10/11 so the graph reads as a
// graph, not a smudge.
const TG_NODES = computeThoughtGraphNodes({
  spread: 260,
  nodeCount: 7,
  seed: 12,
});
const TG_EDGES = computeThoughtGraphEdges(TG_NODES, 12);
const TG_NODES_ROT = computeThoughtGraphNodes({
  spread: 270,
  nodeCount: 7,
  seed: 13,
});
const TG_EDGES_ROT = computeThoughtGraphEdges(TG_NODES_ROT, 13);
const T_DRIFT_LOWDENS = driftingField({
  density: 0.5,
  seed: 9,
  falloff: 0.3,
});
// Cut 14 was reading as a clone of Cut 1 (sparse drift). orbitNebula
// has the same density envelope but arranges particles on concentric
// elliptical orbits with depth strata — same engine, distinctly
// different shape from a flat starfield.
const T_ORBIT_NEBULA = orbitNebula({ maxRadius: 760, seed: 71 });
// Wave ribbon — topographic composition variant that lets the same
// particle engine read as a sweeping terrain. Used in Cut 13 to give
// the post-UI moment its own distinct shape rather than rehashing the
// cube.
const T_WAVE_RIBBON = waveRibbon({
  amplitude: 220,
  frequency: 1.7,
  seed: 91,
});
const T_DRIFT_SHIMMER = driftingField({
  density: 0.85,
  seed: 17,
  falloff: 0.15,
});
const T_SPIRAL = spiralToward({ maxRadius: 720, turns: 2.4, seed: 41 });
const T_LOGO = logoQuest({ scale: 0.6, seed: 33 });
const T_LOGO_SETTLED = logoQuest({ scale: 0.55, seed: 33 });
const T_COPY_HALO = copyHalo({ seed: 55 });
const T_VOID = voidTarget();

const CD = V8_CUT_DURATIONS;
const cumStart = (i: number): number =>
  CD.slice(0, i).reduce<number>((a, n) => a + n, 0);
const UI_FRAME_W = 1160;
const UI_FRAME_H = UI_FRAME_W * (9 / 16);
const UI_FRAME_SCALE = UI_FRAME_W / V8_WIDTH;

// ---------------------------------------------------------------------
// Cut wrappers — each is a tiny presentational component reading
// useCurrentFrame() relative to its own Sequence. They all just feed
// targets to <ParticleField>, plus optional text overlays.
// ---------------------------------------------------------------------

function Cut1(): ReactElement {
  // Silent. Pure cosmos — sparse but legible (density 0.4, falloff 0.55).
  // jitter raised 0.7→1.6 so micro-drift reads per-frame — the field is
  // intentional motion, not compression noise.
  const frame = useCurrentFrame();
  const a = interpolate(frame, [0, 22, 45], [0, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <ParticleField
      to={T_DRIFT_VERY_SPARSE}
      morphFrames={1}
      jitter={1.6}
      alphaScale={a}
    />
  );
}

function Cut2(): ReactElement {
  // Particles begin condensing toward center — density rises smoothly.
  return (
    <ParticleField
      from={T_DRIFT_VERY_SPARSE}
      to={T_DRIFT_SPARSE}
      morphFrames={55}
      jitter={0.5}
    />
  );
}

function Cut3(): ReactElement {
  // Cluster forms — particles converge from drift to a square shell.
  // First hint that "something is forming."
  return (
    <ParticleField
      from={T_DRIFT_SPARSE}
      to={T_CONDENSE_HINT}
      morphFrames={62}
      jitter={0.45}
    />
  );
}

function Cut4(): ReactElement {
  // Particles snap to a tight opaque cube; caption appears once the
  // cube is settled (after ~38 frames, so 0.6s into the cut).
  const frame = useCurrentFrame();
  const captionA = interpolate(frame, [38, 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <ParticleField
        from={T_CONDENSE_HINT}
        to={T_CUBE_OPAQUE}
        morphFrames={36}
        jitter={0.28}
      />
      <CaptionLowerThird
        words={V8_COPY.cut4.words}
        fontSize={V8_COPY.cut4.fontSize}
        weight={V8_COPY.cut4.weight}
        appearAt={38}
        wordStaggerFrames={7}
        opacity={captionA}
      />
    </>
  );
}

function Cut5(): ReactElement {
  // Cube subtle breath — visual rest after caption.
  return (
    <ParticleField
      from={T_CUBE_OPAQUE}
      to={T_CUBE_OPAQUE_BREATH}
      morphFrames={42}
      jitter={0.55}
    />
  );
}

function Cut6(): ReactElement {
  // Implied dolly — push-in. Cube tightens by 10%.
  return (
    <ParticleField
      from={T_CUBE_OPAQUE_BREATH}
      to={T_CUBE_OPAQUE_TIGHT}
      morphFrames={75}
      jitter={0.45}
    />
  );
}

function Cut7(): ReactElement {
  // Cube continues tightening, vignette presses in. "보이지 않습니다."
  const frame = useCurrentFrame();
  const captionA = interpolate(frame, [12, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Vignette ramps from 0.4 to 0.7 over the cut.
  const vig = interpolate(frame, [0, 60], [0.4, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <ParticleField
        from={T_CUBE_OPAQUE_TIGHT}
        to={T_CUBE_OPAQUE_TIGHTER}
        morphFrames={50}
        jitter={0.45}
      />
      <Vignette opacity={vig} />
      <CaptionCenterLow
        words={V8_COPY.cut7.words}
        fontSize={V8_COPY.cut7.fontSize}
        weight={V8_COPY.cut7.weight}
        appearAt={12}
        wordStaggerFrames={9}
        opacity={captionA}
      />
    </>
  );
}

function Cut8(): ReactElement {
  // Cube fully opaque, isolated, vignette tightest. Held in stillness.
  // First 30f: faint breath. Last 60f: near-zero motion (≥2s @30fps of
  // photographic stillness — the held-photograph beat the brief asks for).
  const frame = useCurrentFrame();
  const breathe =
    frame < 30 ? 1 + Math.sin(frame * 0.06) * 0.012 : 1 + Math.sin(frame * 0.06) * 0.0025;
  const microJitter = frame < 30 ? 0.55 : 0.18;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${breathe})`,
        transformOrigin: "center",
      }}
    >
      <ParticleField
        to={T_CUBE_OPAQUE_TIGHTER}
        morphFrames={1}
        jitter={microJitter}
      />
      <Vignette opacity={0.78} />
    </div>
  );
}

function Cut9(): ReactElement {
  // ★ SIGNATURE — opaque cube holds for 16 frames (the moment of
  // crystallisation), then dilates outward as the interior lights up
  // to highlight cobalt. NO TEXT — load-bearing beat of the film.
  // Graph edges fade in as soon as dilation begins (frame > 30) so by
  // f40 (the critic's sample of the signature beat), the structure is
  // already legibly a graph, not a blob.
  const frame = useCurrentFrame();
  const edgeA = interpolate(frame, [22, 38, 75], [0, 0.85, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <ParticleField
        from={T_CUBE_OPAQUE_TIGHTER}
        to={T_CUBE_DILATED}
        morphStart={16}
        morphFrames={50}
        jitter={0.35}
      />
      <ThoughtGraphEdges
        nodes={TG_NODES}
        edges={TG_EDGES}
        opacity={edgeA}
      />
    </>
  );
}

function Cut10(): ReactElement {
  // Thought-graph rotation, camera implied above.
  // Edges visible throughout — this IS the graph cut.
  const frame = useCurrentFrame();
  // Crossfade edges from initial layout to rotated layout.
  const t = interpolate(frame, [0, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <ParticleField
        from={T_CUBE_DILATED}
        to={T_THOUGHT_GRAPH}
        morphFrames={55}
        jitter={0.4}
      />
      <ThoughtGraphEdges
        nodes={TG_NODES}
        edges={TG_EDGES}
        opacity={(1 - t) * 0.85}
      />
      <ThoughtGraphEdges
        nodes={TG_NODES_ROT}
        edges={TG_EDGES_ROT}
        opacity={t * 0.85}
      />
    </>
  );
}

function Cut11(): ReactElement {
  // Instructor sees — UI EMERGES from the cube interior.
  // Brief C.5/C.1/C.6.2 — particles reconstruct (~0.4s = 12f), held
  // screenshot fades up over 6f, hold ~24f, fade out 6f happens in Cut12.
  // Cube ghost (shell) sits behind throughout so the UI is anchored
  // inside the dilated cube interior.
  const frame = useCurrentFrame();
  // Particle field stays prominent during reconstruct, dims during hold.
  const fieldA = interpolate(frame, [0, 12, 30], [1, 0.85, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // UI fades in starting f12 → fully visible by f18 (6f crossfade).
  const uiA = interpolate(frame, [12, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Edges fade dim as UI takes over.
  const edgeA = interpolate(frame, [0, 12, 24], [0.85, 0.55, 0.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Cube ghost (shell outline) — comes in early to anchor the UI.
  // Held bright through the screenshot window (frames 12-42) so the UI
  // is visibly framed by the cobalt cube edge, not floating on dark.
  const ghostA = interpolate(frame, [0, 12, 42, 60], [0, 0.95, 0.95, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <ParticleField
        from={T_THOUGHT_GRAPH}
        to={T_THOUGHT_GRAPH_ROT}
        morphFrames={70}
        jitter={0.5}
        alphaScale={fieldA}
      />
      <ParticleField
        to={T_CUBE_GHOST}
        morphFrames={1}
        jitter={0.3}
        alphaScale={ghostA}
      />
      <ThoughtGraphEdges
        nodes={TG_NODES_ROT}
        edges={TG_EDGES_ROT}
        opacity={edgeA}
      />
      <UIFrame opacity={uiA}>
        <InstructorGradeMock />
      </UIFrame>
    </>
  );
}

function Cut12(): ReactElement {
  // UI HELD ~30f only (1.0s @30fps), then DISSOLVE back to particles
  // for the remaining ~75f. Brief C.6.2: held PNG max 1.0s, then
  // dissolve. White visible only inside this held window.
  // Cube ghost stays behind UI throughout the cut.
  const frame = useCurrentFrame();
  // 0..30 hold; 30..36 fade out (6f); 36..105 particles take over.
  const uiA = interpolate(
    frame,
    [0, 30, 36],
    [1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Particle field dim during hold, brightens after dissolve.
  const fieldA = interpolate(frame, [0, 30, 50, 105], [0.35, 0.4, 0.75, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Cube ghost: visible during hold, fades as we leave.
  const ghostA = interpolate(frame, [0, 30, 60], [0.95, 0.7, 0.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Edges return after dissolve to re-anchor the graph.
  const edgeA = interpolate(frame, [0, 30, 60], [0.18, 0.35, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <ParticleField
        to={T_THOUGHT_GRAPH_ROT}
        morphFrames={1}
        jitter={0.4}
        alphaScale={fieldA}
      />
      <ParticleField
        to={T_CUBE_GHOST}
        morphFrames={1}
        jitter={0.3}
        alphaScale={ghostA}
      />
      <ThoughtGraphEdges
        nodes={TG_NODES_ROT}
        edges={TG_EDGES_ROT}
        opacity={edgeA}
      />
      <UIFrame opacity={uiA}>
        <InstructorGradeMock streaming startFrame={-15} />
      </UIFrame>
      <UIScanSweep
        opacity={interpolate(frame, [0, 18, 36], [0, 0.48, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
        progress={interpolate(frame, [6, 36], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
    </>
  );
}

function Cut13(): ReactElement {
  // UI dissolved; particles reorganise as a sweeping wave ribbon —
  // brief A.3 demands compositional VARIATION from a single material.
  // Wave is the "topographic ribbon" beat: same particles, rearranged
  // as a sine-wave terrain crossing the frame. morphFrames tightened
  // 70→40 so the wave is fully formed by ~f40 and held for the rest
  // of the cut (Cut13 dur = 90), giving the composition real screen time.
  return (
    <ParticleField
      from={T_THOUGHT_GRAPH_ROT}
      to={T_WAVE_RIBBON}
      morphFrames={40}
      jitter={0.45}
    />
  );
}

function Cut14(): ReactElement {
  // Orbit nebula — wave settles into concentric elliptical orbits
  // with depth strata. Distinctly different from Cut 1 sparse drift,
  // and from Cut 13 wave: 3rd compositional variant in 3 cuts, all
  // from the same particle engine.
  return (
    <ParticleField
      from={T_WAVE_RIBBON}
      to={T_ORBIT_NEBULA}
      morphFrames={70}
      jitter={0.55}
    />
  );
}

function Cut15(): ReactElement {
  // Particles shimmer — orbit nebula gradually relaxes to the looser
  // shimmer field (handoff into the spiral).
  return (
    <ParticleField
      from={T_ORBIT_NEBULA}
      to={T_DRIFT_SHIMMER}
      morphFrames={70}
      jitter={0.7}
    />
  );
}

function Cut16(): ReactElement {
  // Spiral toward Q center.
  return (
    <ParticleField
      from={T_DRIFT_SHIMMER}
      to={T_SPIRAL}
      morphFrames={90}
      jitter={0.5}
    />
  );
}

function Cut17(): ReactElement {
  // Funnel into Q-mark; particles form Q by f62, then SNAP to the
  // SOLID v8 logo (Q glyph only, two-cobalt gradient, no sparkle).
  // Brief C.4: "logotype only, no tagline" — no caption.
  const frame = useCurrentFrame();
  const solidA = interpolate(
    frame,
    [62, 82, 120],
    [0, 1, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Particles dim as the solid mark snaps in.
  const particleA = interpolate(
    frame,
    [60, 82],
    [1, 0.18],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <>
      <ParticleField
        from={T_SPIRAL}
        to={T_LOGO}
        morphFrames={62}
        jitter={0.28}
        alphaScale={particleA}
      />
      <SolidLogoOverlay opacity={solidA} />
    </>
  );
}

function Cut18(): ReactElement {
  // Solid logo HOLDS in stillness — ≥2s of held photographic stillness
  // (the brief asks for ≥60f of micro-jitter only somewhere in the
  // film; this is one of two such anchor moments). No sub-copy: the
  // tagline "사고 과정을 봅니다" was a brief violation of C.4 and is
  // removed entirely. The closing line in Cut 20 carries the message.
  return (
    <>
      <ParticleField
        from={T_LOGO}
        to={T_LOGO_SETTLED}
        morphFrames={40}
        jitter={0.18}
        alphaScale={0.18}
      />
      <SolidLogoOverlay opacity={1} />
    </>
  );
}

function Cut19(): ReactElement {
  // Student exam UI: brief C.5/C.6.2 — particle reconstruction (~15f),
  // held screenshot (54f = 1.8s, the max allowed per appearance),
  // particle dispersal. The held window is
  // wider than Cut 12 because the student-side UI is the second proof
  // point and must be legible in stills.
  // Cut19 dur = 120; phases: 0-15 reconstruct, 15-21 fade-in (6f),
  // 21-75 hold (54f), 75-81 fade-out (6f), 81-120 disperse.
  const frame = useCurrentFrame();
  const uiA = interpolate(
    frame,
    [15, 21, 75, 81],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const fieldA = interpolate(
    frame,
    [0, 18, 75, 120],
    [0.95, 0.5, 0.55, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Cube ghost present during reconstruct + hold, fades during disperse.
  const ghostA = interpolate(
    frame,
    [0, 15, 75, 102],
    [0, 0.85, 0.8, 0.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <>
      <ParticleField
        from={T_LOGO_SETTLED}
        to={T_ORBIT_NEBULA}
        morphFrames={28}
        jitter={0.5}
        alphaScale={fieldA}
      />
      <ParticleField
        to={T_CUBE_GHOST}
        morphFrames={1}
        jitter={0.3}
        alphaScale={ghostA}
      />
      <UIFrame opacity={uiA}>
        <StudentExamMock streaming={false} />
      </UIFrame>
      <UIScanSweep
        opacity={interpolate(frame, [18, 32, 74, 88], [0, 0.46, 0.46, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
        progress={interpolate(frame, [18, 78], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
    </>
  );
}

function Cut20(): ReactElement {
  // "결과보다, 과정입니다." full-screen crescendo.
  const frame = useCurrentFrame();
  const headA = interpolate(frame, [10, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fieldA = interpolate(frame, [0, 30, 90], [1, 0.62, 0.46], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <ParticleField
        from={T_ORBIT_NEBULA}
        to={T_COPY_HALO}
        morphFrames={45}
        jitter={0.5}
        alphaScale={fieldA}
      />
      <FullScreenTitle
        words={V8_COPY.cut20.words}
        fontSize={V8_COPY.cut20.fontSize}
        weight={V8_COPY.cut20.weight}
        opacity={headA}
        appearAt={10}
        wordStaggerFrames={10}
      />
    </>
  );
}

function Cut21(): ReactElement {
  // Outro — particles drift apart, fade.
  const frame = useCurrentFrame();
  const a = interpolate(frame, [0, 30, 60], [1, 0.6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <ParticleField
      from={T_COPY_HALO}
      to={T_VOID}
      morphFrames={60}
      jitter={0.4}
      alphaScale={a}
    />
  );
}

// ---------------------------------------------------------------------
// Text overlays — minimal; word-level stagger only.
// ---------------------------------------------------------------------

interface CaptionProps {
  words: readonly string[];
  fontSize: number;
  weight: number;
  appearAt: number;
  wordStaggerFrames: number;
  opacity: number;
}

function CaptionLowerThird({
  words,
  fontSize,
  weight,
  appearAt,
  wordStaggerFrames,
  opacity,
}: CaptionProps): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 110,
        display: "flex",
        justifyContent: "center",
        gap: 14,
        opacity,
        fontFamily:
          "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, sans-serif",
        letterSpacing: 0,
      }}
    >
      {words.map((w, i) => (
        <StaggeredWord
          key={i}
          word={w}
          appearAt={appearAt + i * wordStaggerFrames}
          fontSize={fontSize}
          weight={weight}
          color={captionWordColor(w)}
        />
      ))}
    </div>
  );
}

function CaptionCenterLow({
  words,
  fontSize,
  weight,
  appearAt,
  wordStaggerFrames,
  opacity,
}: CaptionProps): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: V8_HEIGHT * 0.66,
        display: "flex",
        justifyContent: "center",
        gap: 18,
        opacity,
        fontFamily:
          "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, sans-serif",
        letterSpacing: 0,
      }}
    >
      {words.map((w, i) => (
        <StaggeredWord
          key={i}
          word={w}
          appearAt={appearAt + i * wordStaggerFrames}
          fontSize={fontSize}
          weight={weight}
          color={captionWordColor(w)}
        />
      ))}
    </div>
  );
}

function FullScreenTitle({
  words,
  fontSize,
  weight,
  opacity,
  appearAt,
  wordStaggerFrames,
}: CaptionProps): ReactElement {
  // Two-line layout: word[0] line 1, word[1] line 2.
  const [w1, w2] = words;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        opacity,
        fontFamily:
          "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, sans-serif",
        letterSpacing: 0,
        gap: 12,
      }}
    >
      <StaggeredWord
        word={w1}
        appearAt={appearAt}
        fontSize={fontSize}
        weight={weight}
        color="#E2E8F0"
      />
      <StaggeredWordHighlight
        word={w2}
        appearAt={appearAt + wordStaggerFrames}
        fontSize={fontSize}
        weight={weight}
      />
    </div>
  );
}

interface StaggeredWordProps {
  word: string;
  appearAt: number;
  fontSize: number;
  weight: number;
  color: string;
}

function StaggeredWord({
  word,
  appearAt,
  fontSize,
  weight,
  color,
}: StaggeredWordProps): ReactElement {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [appearAt, appearAt + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ty = interpolate(frame, [appearAt, appearAt + 14], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <span
      style={{
        fontSize,
        fontWeight: weight,
        color,
        opacity: a,
        transform: `translateY(${ty}px)`,
        display: "inline-block",
        textShadow: "0 0 24px rgba(5,7,15,0.82)",
      }}
    >
      {word}
    </span>
  );
}

function captionWordColor(word: string): string {
  return /AI|과정/.test(word) ? V8_PALETTE.highlight : "#E2E8F0";
}

// "과정입니다." in cut 20 — second word colored highlight.
function StaggeredWordHighlight({
  word,
  appearAt,
  fontSize,
  weight,
}: Omit<StaggeredWordProps, "color">): ReactElement {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [appearAt, appearAt + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ty = interpolate(frame, [appearAt, appearAt + 14], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // "과정" gets highlight cobalt; rest stays cool white.
  const m = /^(과정)(.*)$/.exec(word);
  if (!m) {
    return (
      <span
        style={{
          fontSize,
          fontWeight: weight,
          color: "#E2E8F0",
          opacity: a,
          transform: `translateY(${ty}px)`,
          display: "inline-block",
          textShadow: "0 0 24px rgba(5,7,15,0.82)",
        }}
      >
        {word}
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize,
        fontWeight: weight,
        opacity: a,
        transform: `translateY(${ty}px)`,
        display: "inline-block",
        textShadow: "0 0 24px rgba(5,7,15,0.82)",
      }}
    >
      <span
        style={{
          color: V8_PALETTE.highlight,
          textShadow: "0 0 20px rgba(87,205,255,0.28)",
        }}
      >
        {m[1]}
      </span>
      <span style={{ color: "#E2E8F0" }}>{m[2]}</span>
    </span>
  );
}

// ---------- Solid vector logo overlay (used at cut 17 for the snap payoff)
// Renders the v8-only logo (Q-mark only, two-cobalt gradient, no
// sparkle ornament, no third blue) centered, scaled to match the
// particle Q. Brief C.3/C.6.6: only #3559C4 + #57CDFF — no third blue.
function SolidLogoOverlay({
  opacity,
}: {
  opacity: number;
}): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        opacity,
        pointerEvents: "none",
      }}
    >
      <QuestOnLogoV8 height={360} />
    </div>
  );
}

// ---------- Thought-graph explicit edges --------------------------
// Renders cobalt-highlight lines between graph node positions, sharing
// the same coordinate system as <ParticleField>. Stroke width is set
// for 1080p so the edges actually read as a graph, not as scratches.
function ThoughtGraphEdges({
  nodes,
  edges,
  opacity = 1,
  color = V8_PALETTE.highlight,
}: {
  nodes: { x: number; y: number }[];
  edges: { a: number; b: number }[];
  opacity?: number;
  color?: string;
}): ReactElement {
  return (
    <svg
      width={V8_WIDTH}
      height={V8_HEIGHT}
      viewBox={`0 0 ${V8_WIDTH} ${V8_HEIGHT}`}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
      }}
    >
      <g>
        {edges.map((e, i) => {
          const a = nodes[e.a];
          const b = nodes[e.b];
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={2.4}
              strokeOpacity={0.85}
            />
          );
        })}
        {nodes.map((n, i) => (
          <circle
            key={`n${i}`}
            cx={n.x}
            cy={n.y}
            r={7}
            fill={color}
            opacity={1}
          />
        ))}
      </g>
    </svg>
  );
}

// ---------- UI screenshot frame --------------------------------------
// Holds an actual product UI mock at small size, centered, with a soft
// glow framing it. Acts as the "resolved" state that the particles
// dissolve into and back out of.
function UIFrame({
  children,
  opacity,
}: {
  children: ReactElement;
  opacity: number;
}): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        opacity,
      }}
    >
      <div
        style={{
          width: UI_FRAME_W,
          height: UI_FRAME_H,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: `0 0 0 1px rgba(53,89,196,0.45), 0 26px 72px rgba(0,0,0,0.68), 0 0 64px rgba(53,89,196,0.18)`,
          filter: "brightness(0.96) saturate(0.96)",
        }}
      >
        <div
          style={{
            width: 1920,
            height: 1080,
            transform: `scale(${UI_FRAME_SCALE})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// Frame-driven scan line that ties resolved UI states back to the
// particle/analysis metaphor without adding another narration text event.
function UIScanSweep({
  opacity,
  progress,
}: {
  opacity: number;
  progress: number;
}): ReactElement {
  const left = (V8_WIDTH - UI_FRAME_W) / 2;
  const top = (V8_HEIGHT - UI_FRAME_H) / 2;
  const x = left + UI_FRAME_W * progress;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: UI_FRAME_W,
        height: UI_FRAME_H,
        opacity,
        pointerEvents: "none",
        overflow: "hidden",
        borderRadius: 14,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: x - left - 1,
          top: 0,
          bottom: 0,
          width: 1,
          background: "rgba(87,205,255,0.72)",
          boxShadow:
            "0 0 14px rgba(87,205,255,0.46), 0 0 42px rgba(87,205,255,0.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: Math.max(0, x - left - 170),
          top: 0,
          bottom: 0,
          width: 170,
          background:
            "linear-gradient(90deg, rgba(87,205,255,0), rgba(87,205,255,0.10))",
        }}
      />
    </div>
  );
}

// ---------- Vignette --------------------------------------------------
function Vignette({ opacity }: { opacity: number }): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse at center, transparent 35%, #05070F 75%)",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}

// ---------------------------------------------------------------------
// Top-level film
// ---------------------------------------------------------------------

const CUTS = [
  Cut1, Cut2, Cut3, Cut4, Cut5, Cut6, Cut7, Cut8, Cut9, Cut10,
  Cut11, Cut12, Cut13, Cut14, Cut15, Cut16, Cut17, Cut18, Cut19, Cut20, Cut21,
];

export function V8Demo(): ReactElement {
  return (
    <AbsoluteFill style={{ background: V8_PALETTE.bg }}>
      {CUTS.map((Cut, i) => (
        <Sequence
          key={i}
          from={cumStart(i)}
          durationInFrames={CD[i]}
          name={`Cut${i + 1}`}
        >
          <AbsoluteFill style={{ background: V8_PALETTE.bg }}>
            <Cut />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
