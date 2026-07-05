// Marketing still: professor grading ROI card from static HTML viewer.
// Usage: node scripts/shoot-linkedin-grading-roi.mjs
// Output: marketing/linkedin/posts/assets/2026-07-08/grading-roi-hero.png

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(
  ROOT,
  "marketing/linkedin/posts/assets/2026-07-08/_viewer-grading-roi.html",
);
const OUT_DIR = path.join(ROOT, "marketing/linkedin/posts/assets/2026-07-08");
const OUT = path.join(OUT_DIR, "grading-roi-hero.png");

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1080, height: 1080 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});

const fileUrl = `file://${HTML}`;
await page.goto(fileUrl, { waitUntil: "load" });
await page.waitForSelector("#cardA");
const card = page.locator("#cardA");
await card.screenshot({ path: OUT });
console.log("Wrote", OUT);

await browser.close();
