import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const assetDir = path.join(
  projectRoot,
  "marketing",
  "linkedin",
  "posts",
  "assets",
  "2026-07-22",
);
const htmlPath = path.join(assetDir, "grading-interview-linkedin.html");
const outputPath = path.join(assetDir, "grading-interview-linkedin.png");

if (!fs.existsSync(htmlPath)) {
  throw new Error(`HTML source not found: ${htmlPath}`);
}

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE ||
  (fs.existsSync(localChrome) ? localChrome : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});

try {
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 1,
  });

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const card = page.locator("#linkedin-card");
  const box = await card.boundingBox();
  if (!box || box.width !== 1080 || box.height !== 1350) {
    throw new Error(`Unexpected card size: ${JSON.stringify(box)}`);
  }

  await card.screenshot({ path: outputPath, type: "png" });
  console.error(`Saved 1080x1350 LinkedIn image: ${outputPath}`);
} finally {
  await browser.close();
}
