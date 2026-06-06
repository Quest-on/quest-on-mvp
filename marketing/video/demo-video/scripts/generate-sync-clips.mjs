#!/usr/bin/env node
//
// Generate 2 new HappyHorse clips to fix Blackbox→Glassbox sync:
//   01b-blackbox-hold        — extends blackbox visibility until L7 starts
//   02b-blackbox-to-glassbox — single clip covering full transition during L7
//
// Usage: FAL_KEY=... node scripts/generate-sync-clips.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const VIDEO_OUT = path.join(PROJECT_ROOT, "assets/video");

const MODEL_ID = "alibaba/happy-horse/text-to-video";
const API_ROOT = "https://queue.fal.run";

const STYLE_BLOCK = `A premium institutional B2B SaaS commercial scene for a university \
assessment platform called Quest-On. Quest-On brand palette: deep navy background \
(#05070F), graphite matte cube surfaces, cobalt blue (#3559C4) primary accent, \
very limited cyan (#57CDFF) highlights only on critical light points. Mood: calm, \
serious, trustworthy, premium institutional. Slow controlled cinematic camera, \
restrained motion, precise hard shadows, subtle volumetric haze. Composition \
centered, 16:9, photorealistic 3D render quality. Audio: subtle low institutional \
tone, quiet glass resonance, no speech.`;

const NEGATION_BLOCK = `Strict exclusions: no people, no human silhouettes, no faces, \
no hands, no graduation caps, no academic robes. No readable text, no letters, no \
numbers, no fake UI labels, no fake interface text, no panels with text, no charts \
with labels. No logos, no university marks, no brand names, no watermarks. No \
sci-fi tropes, no cyberpunk, no fantasy elements, no spaceship, no magic effects, \
no explosive sparks, no lens flare overload, no neon, no holograms with readable \
content. Single subject only. Same graphite cube identity across all clips for \
continuity.`;

const clips = {
  "01b-blackbox-hold": {
    prompt: `${STYLE_BLOCK}\n\nA heavy graphite matte cube sits exactly at the center of the frame in a deep navy void (#05070F). The cube is the same identity as the previous clip — same size, same fine graphite micro-texture, same single thin cobalt blue (#3559C4) rim light along one edge. The camera holds completely static with no movement. The cube rotates slowly and smoothly by 15 degrees over the 6 seconds. Very faint cobalt blue particles drift slowly in the deep background, extremely sparse and subtle. The cube must feel weighty, calm, inspectable but completely opaque and unrevealing. No surface markings, no inscriptions, no text, no UI. The lighting and cube position must match the end of the previous blackbox clip for seamless continuity.\n\n${NEGATION_BLOCK}`,
  },
  "02b-blackbox-to-glassbox": {
    prompt: `${STYLE_BLOCK}\n\nThe same heavy graphite matte cube at center frame, same lighting, same environment, same deep navy void (#05070F). This clip shows a clear three-phase transformation over 6 seconds. PHASE ONE (0 to 2 seconds): The cube holds completely still, opaque, solid, and unrevealing — a pure black box with no change. PHASE TWO (2 to 4 seconds): A single bright cobalt blue (#3559C4) point of light ignites on the front-facing surface. From that point, a sharp crystalline crack propagates across the cube surface — clean, deliberate, not violent. The outer graphite shell fractures inward revealing a transparent interior. PHASE THREE (4 to 6 seconds): The outer graphite shell is fully gone, revealing a clean transparent glass cube with faint cobalt blue wireframe traces and small particles arranged in an abstract pattern inside. By the final frame, only the transparent glass cube remains, fully resolved, centered, and settled. Camera holds static throughout. The transformation must feel inevitable and graceful, not explosive.\n\n${NEGATION_BLOCK}`,
  },
};

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required. Export it before running.`);
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
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`fal request failed (${response.status}): ${JSON.stringify(data)}`);
  return data;
}

function findFirstVideoUrl(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.url === "string" && /\.(mp4|mov|webm)(\?|$)/i.test(value.url)) return value.url;
  if (typeof value.video_url === "string") return value.video_url;
  if (typeof value.file_url === "string" && /\.(mp4|mov|webm)(\?|$)/i.test(value.file_url)) return value.file_url;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) { const found = findFirstVideoUrl(item); if (found) return found; }
    } else if (typeof child === "object") {
      const found = findFirstVideoUrl(child); if (found) return found;
    }
  }
  return null;
}

async function download(url, filePath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`download failed (${response.status}) from ${url}`);
  await pipeline(response.body, createWriteStream(filePath));
}

async function generateOne(clipKey, key) {
  const clip = clips[clipKey];
  if (!clip) throw new Error(`Unknown clip "${clipKey}"`);
  await mkdir(VIDEO_OUT, { recursive: true });

  const input = {
    prompt: clip.prompt,
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
    path.join(VIDEO_OUT, `${clipKey}.submit.json`),
    JSON.stringify({ model: MODEL_ID, input, submit }, null, 2),
  );

  let status = submit;
  while (status.status !== "COMPLETED") {
    await new Promise((r) => setTimeout(r, 5000));
    status = await falFetch(`${submit.status_url}?logs=1`, key);
    const queue = status.queue_position === undefined ? "" : ` queue=${status.queue_position}`;
    console.log(`  ${status.status}${queue}`);
  }

  const result = await falFetch(status.response_url ?? submit.response_url, key);
  const resultPath = path.join(VIDEO_OUT, `${clipKey}.result.json`);
  await writeFile(resultPath, JSON.stringify(result, null, 2));

  const videoUrl = findFirstVideoUrl(result);
  if (!videoUrl) {
    console.log(`  ⚠ no video URL detected. Inspect ${resultPath}`);
    return null;
  }

  const videoPath = path.join(VIDEO_OUT, `${clipKey}.mp4`);
  await download(videoUrl, videoPath);
  console.log(`  ✓ ${videoPath}`);
  return videoPath;
}

async function main() {
  const key = requireEnv("FAL_KEY");
  for (const k of Object.keys(clips)) {
    try {
      await generateOne(k, key);
    } catch (err) {
      console.error(`  ✗ ${k} failed: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
