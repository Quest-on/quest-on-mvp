import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const outDir = '/Users/cigro/Yeongjun/quest-on/test-results/product-screens';
fs.mkdirSync(outDir, { recursive: true });

async function capture() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Full page screenshot
  await page.screenshot({ path: path.join(outDir, 'landing-full.png'), fullPage: true });
  
  // Scroll to product preview section
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'landing-product-preview.png') });
  
  // Scroll more
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'landing-features.png') });
  
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'landing-section3.png') });
  
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'landing-section4.png') });

  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'landing-section5.png') });
  
  await browser.close();
  console.log('Done');
}

capture().catch(e => { console.error(e.message); process.exit(1); });
