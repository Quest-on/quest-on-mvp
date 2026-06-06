// Batch render multiple stills from a single bundle.
// Usage:
//   node scripts/batch-stills.mjs <compositionId> <outDir> [<frame1> <frame2> ...]
// Falls back to a default 21-cut × 3-frame plan if no frames given.

import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const compId = args[0] ?? "QuestOnV7";
const outDir = args[1] ?? path.resolve(ROOT, "../out/v7-loop/baseline");

// Default plan: 3 frames per cut for V7. version-a-iter1 frame map — accounts
// for the new transition overlaps (12 fades total) and updated cut durations
// (cut13/14/16 shorter, cut21 longer). Total duration = 1663 frames.
const DEFAULT_PLAN = [
  8, 23, 38, // Cut 01 (start=0, len=45)
  48, 67, 88, // Cut 02 (start=37, len=60)
  103, 127, 153, // Cut 03 (start=89, len=75)
  178, 202, 228, // Cut 04 (start=164, len=75)
  247, 262, 277, // Cut 05 (start=239, len=45)
  292, 321, 353, // Cut 06 (start=276, len=90)
  377, 396, 417, // Cut 07 (start=366, len=60)
  434, 463, 495, // Cut 08 (start=418, len=90)
  522, 546, 572, // Cut 09 (start=508, len=75)
  589, 613, 639, // Cut 10 (start=575, len=75)
  656, 680, 706, // Cut 11 (start=642, len=75)
  736, 770, 806, // Cut 12 (start=717, len=105)
  828, 852, 878, // Cut 13 (start=814, len=75)
  903, 927, 953, // Cut 14 (start=889, len=75)
  972, 1001, 1033, // Cut 15 (start=956, len=90)
  1065, 1099, 1135, // Cut 16 (start=1046, len=105)
  1165, 1203, 1245, // Cut 17 (start=1143, len=120)
  1277, 1315, 1357, // Cut 18 (start=1255, len=120)
  1391, 1429, 1471, // Cut 19 (start=1369, len=120)
  1505, 1534, 1566, // Cut 20 (start=1489, len=90)
  1589, 1618, 1650, // Cut 21 (start=1573, len=90)
];

const frames =
  args.length > 2
    ? args.slice(2).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n))
    : DEFAULT_PLAN;

await fs.mkdir(outDir, { recursive: true });

console.log(`[batch-stills] composition=${compId} frames=${frames.length} outDir=${outDir}`);

console.log("[batch-stills] bundling…");
const t0 = Date.now();
const serveUrl = await bundle({
  entryPoint: path.resolve(ROOT, "index.ts"),
  webpackOverride: (config) => config,
});
console.log(`[batch-stills] bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const composition = await selectComposition({
  serveUrl,
  id: compId,
});
console.log(`[batch-stills] composition: ${composition.width}×${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames}f`);

const chromiumOptions = { gl: "angle" };

let i = 0;
for (const frame of frames) {
  i += 1;
  const out = path.resolve(outDir, `f${String(frame).padStart(4, "0")}.png`);
  const t = Date.now();
  await renderStill({
    composition,
    serveUrl,
    output: out,
    frame,
    imageFormat: "png",
    chromiumOptions,
  });
  console.log(`[${i}/${frames.length}] f${frame} → ${path.basename(out)} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}

console.log("[batch-stills] done");
