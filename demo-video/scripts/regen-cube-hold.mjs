#!/usr/bin/env node
//
// Regenerate a clean, rock-solid "graphite cube hold" clip for Beat 1's
// 6s→9s tail (replaces the jittery ffmpeg zoompan freeze-extend).
//
// Usage:  FAL_KEY=... node scripts/regen-cube-hold.mjs [takeLabel]
// Output: assets/video/00b-cube-hold[.takeLabel].mp4 (+ .submit/.result json)
//
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_OUT = path.resolve(__dirname, "..", "assets/video");
const MODEL_ID = "alibaba/happy-horse/text-to-video";
const API_ROOT = "https://queue.fal.run";

const take = process.argv[2] ? `.${process.argv[2]}` : "";
const PREFIX = `00b-cube-hold${take}`;

const PROMPT = `A premium institutional B2B SaaS commercial scene for a \
university assessment platform called Quest-On. Quest-On brand palette: deep \
navy background (#05070F), graphite matte cube surfaces, cobalt blue (#3559C4) \
primary accent, very limited cyan (#57CDFF) highlights only on critical light \
points. Mood: calm, serious, trustworthy, premium institutional.

A single heavy graphite matte cube sits at the EXACT center of the frame in a \
deep navy void. The cube fills roughly 40% of the frame height. Fine graphite \
micro-texture on the surface; one thin cobalt-blue (#3559C4) rim light running \
along the top edge; very limited cyan (#57CDFF) glint at one corner. The cube \
is the only subject in frame. Throughout the entire 6 seconds the camera is \
LOCKED OFF on a heavy tripod — absolutely no handheld wobble, no camera shake, \
no jitter, no scale pulsing, no bouncing. The cube does not move, does not \
rotate, does not breathe in size. The ONLY motion is one single continuous, \
extremely smooth, very slow dolly-in that pushes toward the cube by about 14% \
over the full six seconds at a perfectly constant speed — like a controlled \
camera-slider move, monotonic, never speeding up, never slowing down, never \
reversing. Precise hard shadows, subtle volumetric haze, photorealistic 3D \
render quality, 16:9, composition centered.

Strict exclusions: no people, no human silhouettes, no faces, no hands, no \
graduation caps, no academic robes. No readable text, no letters, no numbers, \
no fake UI labels, no fake interface text, no panels with text, no charts with \
labels. No logos, no university marks, no brand names, no watermarks. No \
sci-fi tropes, no cyberpunk, no fantasy, no spaceship, no magic effects, no \
explosive sparks, no particles, no lens flare, no neon, no holograms. No camera \
shake, no handheld motion, no whip pans, no orbit, no rotation, no rack focus. \
Single subject only — one graphite cube, dead still, on a locked-off slow \
dolly-in.`;

async function falFetch(url, key, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!r.ok) throw new Error(`fal ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

function findVideoUrl(v) {
  if (!v || typeof v !== "object") return null;
  if (typeof v.url === "string" && /\.(mp4|mov|webm)(\?|$)/i.test(v.url)) return v.url;
  if (typeof v.video_url === "string") return v.video_url;
  for (const c of Object.values(v)) {
    if (Array.isArray(c)) { for (const it of c) { const f = findVideoUrl(it); if (f) return f; } }
    else if (typeof c === "object") { const f = findVideoUrl(c); if (f) return f; }
  }
  return null;
}

async function download(url, fp) {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`download ${r.status}`);
  await pipeline(r.body, createWriteStream(fp));
}

async function main() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY required");
  await mkdir(VIDEO_OUT, { recursive: true });
  const input = { prompt: PROMPT, aspect_ratio: "16:9", resolution: "1080p", duration: 6 };
  console.log(`▶ ${PREFIX} → ${MODEL_ID}`);
  const submit = await falFetch(`${API_ROOT}/${MODEL_ID}`, key, { method: "POST", body: JSON.stringify(input) });
  await writeFile(path.join(VIDEO_OUT, `${PREFIX}.submit.json`), JSON.stringify({ model: MODEL_ID, input, submit }, null, 2));
  let status = submit;
  while (status.status !== "COMPLETED") {
    await new Promise((r) => setTimeout(r, 5000));
    status = await falFetch(`${submit.status_url}?logs=1`, key);
    console.log(`  ${status.status}${status.queue_position === undefined ? "" : ` queue=${status.queue_position}`}`);
  }
  const result = await falFetch(status.response_url ?? submit.response_url, key);
  await writeFile(path.join(VIDEO_OUT, `${PREFIX}.result.json`), JSON.stringify(result, null, 2));
  const url = findVideoUrl(result);
  if (!url) { console.log(`⚠ no video url; see ${PREFIX}.result.json`); return; }
  const fp = path.join(VIDEO_OUT, `${PREFIX}.mp4`);
  await download(url, fp);
  console.log(`✓ ${fp}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
