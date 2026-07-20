import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

/**
 * Render the self-contained A/B grading-boundary visual for LinkedIn.
 *
 * This opens one local HTML file and blocks every non-file request. It does not
 * start Next.js, load environment files, call an API, or connect to a database.
 */

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
  throw new Error(`Missing visual source: ${htmlPath}`);
}

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE ||
  (fs.existsSync(localChrome) ? localChrome : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});

try {
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "ko-KR",
  });
  const page = await context.newPage();

  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith("file:")) {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
  });

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.locator('[data-capture="linkedin-grading-boundary"]').waitFor();
  await page.evaluate(() => document.fonts.ready);

  const dimensions = await page.locator('[data-capture="linkedin-grading-boundary"]').evaluate(
    (element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }),
  );
  if (
    dimensions.width !== 1080 ||
    dimensions.height !== 1350 ||
    dimensions.scrollWidth !== 1080 ||
    dimensions.scrollHeight !== 1350
  ) {
    throw new Error(`Unexpected capture dimensions: ${JSON.stringify(dimensions)}`);
  }

  await page.screenshot({
    path: outputPath,
    type: "png",
    animations: "disabled",
    fullPage: false,
  });

  console.error(`Saved LinkedIn visual: ${outputPath}`);
  console.error("Captured 1080x1350 local-only A/B grading-boundary visual");
} finally {
  await browser.close();
}
