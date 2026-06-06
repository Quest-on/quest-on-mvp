#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const MODEL_ID = "alibaba/happy-horse/text-to-video";
const API_ROOT = "https://queue.fal.run";
const OUT_DIR = path.resolve("out/happyhorse");

const shots = {
  blackbox: {
    filePrefix: "01-blackbox-cube",
    prompt:
      "A premium institutional technology commercial scene. A heavy matte graphite cube floats in a dark navy void. Inside the cube, faint layers of student AI prompts, source cards, answer revisions, and rubric traces glow in cobalt blue, but the outer surface remains opaque. A professor silhouette outside the cube can only see a single final answer card. Slow dolly-in camera, controlled cinematic lighting, minimal, serious, no sci-fi spaceship, no people faces, no logos, no readable brand names. Audio: subtle low institutional tone, quiet glass resonance, no speech.",
  },
  "blackbox-v2": {
    filePrefix: "01-blackbox-cube-v2",
    prompt:
      "A premium institutional B2B SaaS commercial scene for a university assessment platform. Only one subject: a heavy matte graphite cube floating in a deep navy void, lit by restrained cobalt blue edge light. The cube represents an opaque exam process: inside it, faint abstract cobalt particles and thin non-readable interface traces move behind the surface, but no words, no letters, no numbers, no fake UI text. No people, no faces, no graduation caps, no logos, no university marks, no readable labels, no panels with text. The mood is calm, serious, trustworthy, premium institutional, not sci-fi, not cyberpunk. Slow controlled dolly-in, minimal camera movement, precise shadows, Quest-On brand palette: deep navy, graphite, cobalt blue, very limited cyan highlights. Audio: subtle low institutional tone, quiet glass resonance, no speech.",
  },
  crack: {
    filePrefix: "02-crack-to-glassbox",
    prompt:
      "A heavy black graphite cube begins to crack from one sharp cobalt point. Through the crack, transparent glass layers appear: prompt, evidence, revision, rubric, final judgment, represented only as abstract UI-like lines, not readable text. The cube transforms from opaque blackbox to clear glassbox. Premium B2B software commercial style, dark navy background, precise glass refraction, restrained glow, slow cinematic camera move, no logos, no human faces. Audio: restrained crystalline crack, low cinematic pulse, no speech.",
  },
  "crack-v2": {
    filePrefix: "02-crack-to-glassbox-v2",
    prompt:
      "A premium institutional B2B SaaS commercial scene. A heavy matte graphite cube floats alone in a deep navy void. From one precise cobalt blue point, a controlled crack spreads across the opaque cube surface. Through the crack, clear glass layers and abstract cobalt particle trails become visible, suggesting exam process evidence becoming inspectable. No readable text, no letters, no numbers, no fake UI labels, no people, no faces, no logos, no university marks. The transformation must feel calm and credible, not explosive, not fantasy, not cyberpunk. Slow cinematic dolly, restrained cobalt and cyan highlights, graphite shadows, Quest-On brand palette. Audio: restrained crystalline crack, low cinematic pulse, no speech.",
  },
  glassbox: {
    filePrefix: "03-glassbox-process-trace",
    prompt:
      "A transparent glass cube contains layered process traces for an AI-assisted university exam: question, evidence, revision, final reasoning, rubric, all represented as clean abstract interface lines with no readable text. Thin cobalt lines connect each layer. The camera orbits slowly around the cube, then settles front-on. Premium institutional SaaS commercial, clean, trustworthy, calm, deep navy and cobalt palette, no fake readable text, no human faces, no logos. Audio: soft digital chime and calm room tone, no speech.",
  },
  "glassbox-v2": {
    filePrefix: "03-glassbox-process-trace-v2",
    prompt:
      "A transparent glass cube floats alone in a deep navy institutional studio. Inside the cube are layered abstract process traces for an AI-assisted university exam: thin cobalt lines, small particles, connected panes, rubric-like grids represented only as non-readable marks. The cube should feel clear, trustworthy, inspectable, and calm. No readable text, no letters, no numbers, no fake UI, no people, no faces, no logos, no university marks. The camera slowly orbits and settles front-on. Premium B2B SaaS commercial style, Quest-On palette: deep navy, graphite, cobalt blue, subtle cyan highlights, clean shadows, no cyberpunk excess. Audio: soft digital chime and calm room tone, no speech.",
  },
};

function usage() {
  console.log(`Usage:
  FAL_KEY=... node scripts/generate-happyhorse.mjs <shot>

Shots:
  ${Object.keys(shots).join(", ")}

Example:
  FAL_KEY=... node scripts/generate-happyhorse.mjs blackbox
`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Get a fal API key and export it before running.`);
  }
  return value;
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
    throw new Error(`fal request failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

function findFirstVideoUrl(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.url === "string" && /\.(mp4|mov|webm)(\?|$)/i.test(value.url)) {
    return value.url;
  }
  if (typeof value.video_url === "string") return value.video_url;
  if (typeof value.file_url === "string" && /\.(mp4|mov|webm)(\?|$)/i.test(value.file_url)) {
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

async function main() {
  const shotName = process.argv[2];
  if (!shotName || !shots[shotName]) {
    usage();
    process.exit(1);
  }

  const key = requireEnv("FAL_KEY");
  const shot = shots[shotName];
  await mkdir(OUT_DIR, { recursive: true });

  const input = {
    prompt: shot.prompt,
    aspect_ratio: "16:9",
    resolution: "1080p",
    duration: 6,
  };

  console.log(`Submitting ${shotName} to ${MODEL_ID}...`);
  const submit = await falFetch(`${API_ROOT}/${MODEL_ID}`, key, {
    method: "POST",
    body: JSON.stringify(input),
  });

  await writeFile(
    path.join(OUT_DIR, `${shot.filePrefix}.submit.json`),
    JSON.stringify({ model: MODEL_ID, input, submit }, null, 2),
  );

  let status = submit;
  while (status.status !== "COMPLETED") {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    status = await falFetch(`${submit.status_url}?logs=1`, key);
    const queue = status.queue_position === undefined ? "" : ` queue=${status.queue_position}`;
    console.log(`${status.status}${queue}`);
  }

  const result = await falFetch(status.response_url ?? submit.response_url, key);
  const resultPath = path.join(OUT_DIR, `${shot.filePrefix}.result.json`);
  await writeFile(resultPath, JSON.stringify(result, null, 2));

  const videoUrl = findFirstVideoUrl(result);
  if (!videoUrl) {
    console.log(`Completed, but no video URL was detected. Inspect ${resultPath}`);
    return;
  }

  const videoPath = path.join(OUT_DIR, `${shot.filePrefix}.mp4`);
  await download(videoUrl, videoPath);
  console.log(`Saved ${videoPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
