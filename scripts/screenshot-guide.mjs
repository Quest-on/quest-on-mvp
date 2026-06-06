import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const htmlPath = path.resolve(projectRoot, 'marketing', 'guides', 'student-exam-guide.html');
const outDir = path.resolve(projectRoot, 'test-results', 'guide-slides');

async function captureSlides() {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  await page.goto(`file://${htmlPath}`);
  await page.waitForTimeout(500);

  const slideCount = await page.evaluate(() =>
    document.querySelectorAll('[data-slide]').length
  );

  console.error(`Found ${slideCount} slides`);

  for (let i = 1; i <= slideCount; i++) {
    await page.evaluate((n) => {
      if (typeof show === 'function') show(n);
    }, i);
    await page.waitForTimeout(300);
    const outPath = path.join(outDir, `slide-${i}.png`);
    await page.screenshot({ path: outPath });
    console.error(`  slide-${i}.png captured`);
  }

  await browser.close();
  console.error(`\nAll ${slideCount} screenshots saved to: ${outDir}`);
}

captureSlides().catch((err) => {
  console.error('Screenshot error:', err.message);
  process.exit(1);
});
