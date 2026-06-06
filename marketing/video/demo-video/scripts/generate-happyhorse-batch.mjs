#!/usr/bin/env node
//
// Generate the Quest-On 60s ad's HappyHorse clip set with shared style
// and negation blocks. Reads the rules baked into docs/happyhorse-rules.md.
//
// Usage:
//   FAL_KEY=... node scripts/generate-happyhorse-batch.mjs <clip>
//   FAL_KEY=... node scripts/generate-happyhorse-batch.mjs --all
//   node scripts/generate-happyhorse-batch.mjs --extract-frames
//
// Clips: hook | blackbox | crack | orbit | close
// Outputs: assets/video/<NN-name>.mp4 + .submit.json + .result.json

import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const VIDEO_OUT = path.join(PROJECT_ROOT, "assets/video");
const FRAMES_OUT = path.join(PROJECT_ROOT, "assets/video/frames");

const MODEL_ID = "alibaba/happy-horse/text-to-video";
const API_ROOT = "https://queue.fal.run";

// ----- Style block (PREFIX every prompt) ------------------------------------
const STYLE_BLOCK = `A premium institutional B2B SaaS commercial scene for a university \
assessment platform called Quest-On. Quest-On brand palette: deep navy background \
(#05070F), graphite matte cube surfaces, cobalt blue (#3559C4) primary accent, \
very limited cyan (#57CDFF) highlights only on critical light points. Mood: calm, \
serious, trustworthy, premium institutional. Slow controlled cinematic camera, \
restrained motion, precise hard shadows, subtle volumetric haze. Composition \
centered, 16:9, photorealistic 3D render quality. Audio: subtle low institutional \
tone, quiet glass resonance, no speech.`;

// ----- Negation block (APPEND to every prompt) ------------------------------
const NEGATION_BLOCK = `Strict exclusions: no people, no human silhouettes, no faces, \
no hands, no graduation caps, no academic robes. No readable text, no letters, no \
numbers, no fake UI labels, no fake interface text, no panels with text, no charts \
with labels. No logos, no university marks, no brand names, no watermarks. No \
sci-fi tropes, no cyberpunk, no fantasy elements, no spaceship, no magic effects, \
no explosive sparks, no lens flare overload, no neon, no holograms with readable \
content. Single subject only. Same graphite cube identity across all clips for \
continuity.`;

// ----- Clip definitions -----------------------------------------------------
const clips = {
  hook: {
    filePrefix: "00-hook-particle-void",
    subject: `In a deep navy void (#05070F background), cobalt blue particles \
(#3559C4 with limited #57CDFF highlights) start the clip drifting chaotically \
across the entire frame — scattered, dispersed, no center of attention. Over \
the first 3 seconds, the particles begin streaming inward toward the exact \
center, accelerating, converging. By second 4, particles form a clear cube-\
shaped cloud at center frame with sharp edges becoming visible. In the final \
2 seconds, the particles densify and solidify into a fully formed graphite \
matte cube with cobalt blue rim light along one edge — the cube is the only \
subject left in frame, clearly defined, weighty, geometric, ready to be \
inspected. The story arc: scattered chaos converging into one focused opaque \
object. Camera static with imperceptible inward push. The cube MUST be \
clearly visible, solid, and recognizable as a cube by the last frame — not \
a shadow, not a hint, a fully resolved object.`,
  },
  blackbox: {
    filePrefix: "01-blackbox-approach",
    subject: `A heavy graphite matte cube, the same cube identity that emerged at \
the end of the previous clip, sits exactly at the center of the frame in the deep \
navy void. The cube surface is opaque, with very fine graphite micro-texture and \
a single thin cobalt blue rim light along one edge. The camera dollies in slowly \
by approximately 6% over the clip. No other elements in frame. The cube must feel \
weighty, calm, inspectable but unrevealing. No surface markings, no inscriptions.`,
  },
  crack: {
    filePrefix: "02-crack-signature",
    subject: `The same graphite cube as the previous clip, in the same center \
position, same lighting. At second 1, a single bright cobalt blue (#3559C4) point \
of light ignites on the front-facing surface. From that point, a sharp crystalline \
crack propagates across the cube surface over the next 3 seconds — clean, \
deliberate, not violent. By second 5, the cube surface fractures inward and a \
transparent glass cube interior becomes visible inside, with faint internal \
cobalt traces. The camera holds static with a micro-shake at the moment of \
ignition only. The motion must feel inevitable, not explosive.`,
  },
  orbit: {
    filePrefix: "03-glassbox-orbit",
    subject: `The graphite outer shell from the previous clip is gone. A clean \
transparent glass cube sits at the same center position, same scale, same \
environment. Inside the glass cube, faint cobalt blue wireframe traces and small \
particles arrange themselves in an abstract circuit-like pattern (NOT readable \
text, NOT letters, NOT numbers — only abstract lines and dots). The camera \
orbits the cube slowly by approximately 30 degrees from front-left to front-right \
over the clip. Calm, trustworthy, restrained.`,
  },
  close: {
    filePrefix: "04-glassbox-close",
    subject: `The same transparent glass cube as the previous clip, settled facing \
the camera. The camera pushes in slowly by 12% over the clip. As the camera \
approaches, the internal cobalt traces resolve into four distinct abstract panels \
arranged in a 2x2 grid inside the cube — top-left, top-right, bottom-left, \
bottom-right — each panel showing a different abstract pattern (still NOT \
readable text, NOT UI). In the last 1 second, the panels emit a subtle warm \
cobalt pulse and the image holds steady.`,
  },
};

// NOTE: the "cheating" clip intentionally BREAKS the global "no people"
// negation rule — it needs a student figure. It uses a different style
// block (see buildPrompt) that allows a person but keeps the face
// hidden and the tone calm/institutional, never criminal-drama.
clips.cheating = {
  filePrefix: "00-cheating-student",
  breaksNoPeople: true,
  subject: `A single continuous 6-second shot in three clear movements. \
MOVEMENT ONE (0 to 2 seconds): a university student sits alone at a desk \
during an exam, seen from directly behind and slightly above so the face \
is never visible — only the back of the head, the shoulders, and the \
hands resting on a laptop keyboard. On the desk beside the laptop: a \
printed exam paper. The open laptop screen shows an AI chat interface as \
soft abstract message bubbles only — no legible text, no letters, no \
numbers, just rounded cobalt-blue (#3559C4) bubble shapes glowing on a \
dark panel. The student is quietly typing a question into the AI \
assistant. Lighting: one soft overhead light, deep navy ambient \
surroundings (#05070F), cobalt-blue glow spilling from the screen onto \
the desk and the student's hands. The mood is calm, quiet, ordinary — \
this is the new normal, NOT a crime scene, NOT dramatic, NOT tense \
thriller lighting, NOT a security-camera look. The camera holds nearly \
still. MOVEMENT TWO (2 to 4.5 seconds — the centerpiece, give it room): \
the desk, the exam paper, the laptop, and the student all begin to come \
apart into a slow, controlled, intentional drift of cobalt-blue \
(#3559C4) particles — fine soft points lifting off and flowing inward \
toward the exact center of frame. The dissolution reads as deliberate \
and graceful, like fine sand being drawn upward, never chaotic, never an \
explosion, never sparks. By 4.5 seconds the figure and the desk are \
fully gone and only a dense, glowing, cube-shaped cloud of cobalt \
particles remains at center frame, edges starting to harden. MOVEMENT \
THREE (4.5 to 6 seconds): the particle cloud densifies and crystallizes \
into a single fully-formed, solid, opaque graphite matte cube sitting at \
the exact center of frame — fine graphite micro-texture on the surface, \
one thin cobalt-blue (#3559C4) rim light running along one edge, no \
markings of any kind. The cube is weighty, geometric, the opaque "black \
box". In the final 1 second the camera does a barely-perceptible slow \
push-in toward the cube — gentle, ongoing motion, not a frozen frame. \
The cube MUST be clearly visible, solid, and recognizable as a cube by \
the last frame. Deep navy void (#05070F) throughout, cobalt blue \
(#3559C4) accent, very limited cyan (#57CDFF) only on critical light \
points. No visible faces, no other people, no readable text, no logos, \
no university marks, no watermarks, 16:9, photorealistic.`,
};

const CLIP_ORDER = ["cheating", "hook", "blackbox", "crack", "orbit", "close"];

// Variant blocks for the people-allowed cheating clip — keeps the
// premium institutional tone but permits a (faceless) student figure.
const STYLE_BLOCK_PEOPLE = `A premium institutional B2B SaaS commercial scene \
for a university assessment platform called Quest-On. Quest-On brand palette: \
deep navy environment (#05070F), cobalt blue (#3559C4) primary accent, very \
limited cyan (#57CDFF) highlights. Mood: calm, quiet, observational, matter-of-\
fact — NOT dramatic, NOT a thriller, NOT a crime scene, NOT a security-camera \
aesthetic. Slow controlled cinematic camera, soft single-source lighting, \
restrained. Composition centered, 16:9, photorealistic.`;

const NEGATION_BLOCK_PEOPLE = `Strict exclusions: no visible faces (the student \
is seen only from behind / above), no other people, no readable text, no \
letters, no numbers, no legible UI text or labels, no logos, no university \
marks, no watermarks. No dramatic lighting, no red/alarm colors, no neon, no \
sci-fi, no cyberpunk, no security-camera overlay graphics, no surveillance \
framing. The tone must feel ordinary and quiet, not sensational.`;

function buildPrompt(clip) {
  if (clip.breaksNoPeople) {
    return `${STYLE_BLOCK_PEOPLE}\n\n${clip.subject}\n\n${NEGATION_BLOCK_PEOPLE}`;
  }
  return `${STYLE_BLOCK}\n\n${clip.subject}\n\n${NEGATION_BLOCK}`;
}

function usage() {
  console.log(`Usage:
  FAL_KEY=... node scripts/generate-happyhorse-batch.mjs <clip>
  FAL_KEY=... node scripts/generate-happyhorse-batch.mjs --all
  node scripts/generate-happyhorse-batch.mjs --extract-frames

Clips:
  ${CLIP_ORDER.join(", ")}

Examples:
  FAL_KEY=fal_... node scripts/generate-happyhorse-batch.mjs hook
  FAL_KEY=fal_... node scripts/generate-happyhorse-batch.mjs --all
  node scripts/generate-happyhorse-batch.mjs --extract-frames
`);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is required. Export it before running.`);
  }
  return v;
}

async function falFetch(url, key, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(
      `fal request failed (${response.status}): ${JSON.stringify(data)}`,
    );
  }
  return data;
}

function findFirstVideoUrl(value) {
  if (!value || typeof value !== "object") return null;
  if (
    typeof value.url === "string" &&
    /\.(mp4|mov|webm)(\?|$)/i.test(value.url)
  ) {
    return value.url;
  }
  if (typeof value.video_url === "string") return value.video_url;
  if (
    typeof value.file_url === "string" &&
    /\.(mp4|mov|webm)(\?|$)/i.test(value.file_url)
  ) {
    return value.file_url;
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findFirstVideoUrl(item);
        if (found) return found;
      }
    } else if (typeof child === "object") {
      const found = findFirstVideoUrl(child);
      if (found) return found;
    }
  }
  return null;
}

async function download(url, filePath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed (${response.status}) from ${url}`);
  }
  await pipeline(response.body, createWriteStream(filePath));
}

async function generateOne(clipKey, key) {
  const clip = clips[clipKey];
  if (!clip) {
    throw new Error(`Unknown clip "${clipKey}". Use one of: ${CLIP_ORDER.join(", ")}`);
  }
  await mkdir(VIDEO_OUT, { recursive: true });

  const input = {
    prompt: buildPrompt(clip),
    aspect_ratio: "16:9",
    resolution: "1080p",
    duration: 6,
  };

  console.log(`\n▶ ${clipKey} → ${MODEL_ID}`);
  const submit = await falFetch(`${API_ROOT}/${MODEL_ID}`, key, {
    method: "POST",
    body: JSON.stringify(input),
  });

  await writeFile(
    path.join(VIDEO_OUT, `${clip.filePrefix}.submit.json`),
    JSON.stringify({ model: MODEL_ID, input, submit }, null, 2),
  );

  let status = submit;
  while (status.status !== "COMPLETED") {
    await new Promise((r) => setTimeout(r, 5000));
    status = await falFetch(`${submit.status_url}?logs=1`, key);
    const queue =
      status.queue_position === undefined ? "" : ` queue=${status.queue_position}`;
    console.log(`  ${status.status}${queue}`);
  }

  const result = await falFetch(
    status.response_url ?? submit.response_url,
    key,
  );
  const resultPath = path.join(VIDEO_OUT, `${clip.filePrefix}.result.json`);
  await writeFile(resultPath, JSON.stringify(result, null, 2));

  const videoUrl = findFirstVideoUrl(result);
  if (!videoUrl) {
    console.log(`  ⚠ no video URL detected. Inspect ${resultPath}`);
    return null;
  }

  const videoPath = path.join(VIDEO_OUT, `${clip.filePrefix}.mp4`);
  await download(videoUrl, videoPath);
  console.log(`  ✓ ${videoPath}`);
  return videoPath;
}

async function generateAll(key) {
  for (const k of CLIP_ORDER) {
    try {
      await generateOne(k, key);
    } catch (err) {
      console.error(`  ✗ ${k} failed: ${err.message}`);
    }
  }
}

function spawnPromise(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function extractFrames() {
  await mkdir(FRAMES_OUT, { recursive: true });
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(VIDEO_OUT)).filter((f) => f.endsWith(".mp4"));
  if (files.length === 0) {
    console.log("No mp4 files found in assets/video/");
    return;
  }
  for (const f of files) {
    const src = path.join(VIDEO_OUT, f);
    const base = f.replace(/\.mp4$/, "");
    const firstOut = path.join(FRAMES_OUT, `${base}.first.png`);
    const lastOut = path.join(FRAMES_OUT, `${base}.last.png`);
    console.log(`▶ ${f}`);
    await spawnPromise("ffmpeg", [
      "-y",
      "-i", src,
      "-vf", "select=eq(n\\,0)",
      "-vframes", "1",
      firstOut,
    ]);
    await spawnPromise("ffmpeg", [
      "-y",
      "-sseof", "-0.05",
      "-i", src,
      "-vframes", "1",
      lastOut,
    ]);
    console.log(`  ✓ ${path.basename(firstOut)} / ${path.basename(lastOut)}`);
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    usage();
    process.exit(1);
  }
  if (arg === "--extract-frames") {
    await extractFrames();
    return;
  }
  const key = requireEnv("FAL_KEY");
  if (arg === "--all") {
    await generateAll(key);
    return;
  }
  await generateOne(arg, key);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
