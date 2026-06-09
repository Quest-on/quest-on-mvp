// Quest-On Brochure · HTML → PDF builder
// Renders src/index.html to dist/Quest-On_Brochure_2026.pdf (16:9, 13.333in × 7.5in)
// + page screenshots for QA.

import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'index.html');
const DIST = path.join(ROOT, 'dist');
const PDF_OUT = path.join(DIST, 'Quest-On_Brochure_2026.pdf');
const SHOTS = path.join(DIST, 'screenshots');

const PAGE_W_IN = 13.333;
const PAGE_H_IN = 7.5;
const DPR = 2; // retina-quality screenshots

const dotsForSpin = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
let frame = 0;
const tick = (label) => {
  process.stdout.write(`\r${dotsForSpin[frame++ % dotsForSpin.length]} ${label}    `);
};

const log = (msg) => {
  process.stdout.write(`\r✓ ${msg}\n`);
};

async function main() {
  await mkdir(DIST, { recursive: true });
  await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: DPR,
    viewport: { width: Math.round(PAGE_W_IN * 96), height: Math.round(PAGE_H_IN * 96) },
  });
  const page = await context.newPage();

  const url = pathToFileURL(SRC).toString();
  tick('loading HTML');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  log('HTML loaded');

  // PDF
  tick('rendering PDF');
  await page.pdf({
    path: PDF_OUT,
    width: `${PAGE_W_IN}in`,
    height: `${PAGE_H_IN}in`,
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  log(`PDF rendered → ${path.relative(ROOT, PDF_OUT)}`);

  // Per-slide PNG screenshots for QA
  const slideCount = await page.locator('.slide').count();
  log(`detected ${slideCount} slides`);
  for (let i = 0; i < slideCount; i++) {
    const slide = page.locator('.slide').nth(i);
    const idx = String(i + 1).padStart(2, '0');
    const out = path.join(SHOTS, `slide-${idx}.png`);
    tick(`shot ${idx}`);
    await slide.screenshot({ path: out, scale: 'css' });
  }
  log(`${slideCount} screenshots in ${path.relative(ROOT, SHOTS)}/`);

  await browser.close();
}

main().catch((err) => {
  console.error('\n✗ build failed:', err);
  process.exit(1);
});
