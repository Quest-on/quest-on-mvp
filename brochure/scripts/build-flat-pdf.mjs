// Quest-On Brochure · flattened (image-based) PDF builder
// Rasterizes the vector PDF to JPEGs (via poppler `pdftoppm`) and reassembles
// them into an image-only PDF. Loads instantly in any viewer (no vector/font
// work), at the cost of selectable text and a slightly larger file.
//
// Usage: node scripts/build-flat-pdf.mjs   (run `npm run build` first)

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC_PDF = path.join(ROOT, 'dist', 'Quest-On_Brochure_2026.pdf');
const OUT_PDF = path.join(ROOT, 'dist', 'Quest-On_Brochure_2026_image.pdf');
const DPI = 200;
const QUALITY = 82;
const PAGE_W_IN = 13.333;
const PAGE_H_IN = 7.5;

const tmp = mkdtempSync(path.join(tmpdir(), 'qoflat-'));
try {
  // 1) vector PDF -> page JPEGs
  execSync(`pdftoppm -jpeg -r ${DPI} -jpegopt quality=${QUALITY} "${SRC_PDF}" "${path.join(tmp, 'p')}"`);
  const jpgs = readdirSync(tmp).filter((f) => f.endsWith('.jpg')).sort();
  if (!jpgs.length) throw new Error('pdftoppm produced no pages');
  process.stdout.write(`✓ rasterized ${jpgs.length} pages @ ${DPI}dpi\n`);

  // 2) build a full-bleed HTML, one image per page
  const pages = jpgs
    .map((f) => {
      const b64 = readFileSync(path.join(tmp, f)).toString('base64');
      return `<div class="page"><img src="data:image/jpeg;base64,${b64}"></div>`;
    })
    .join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${PAGE_W_IN}in ${PAGE_H_IN}in; margin: 0; }
    * { margin: 0; padding: 0; }
    .page { width: ${PAGE_W_IN}in; height: ${PAGE_H_IN}in; overflow: hidden; break-after: page; }
    .page:last-child { break-after: auto; }
    img { width: 100%; height: 100%; display: block; }
  </style></head><body>${pages}</body></html>`;

  // 3) HTML -> image-only PDF
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({
    path: OUT_PDF,
    width: `${PAGE_W_IN}in`,
    height: `${PAGE_H_IN}in`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await browser.close();
  process.stdout.write(`✓ flattened PDF → ${path.relative(ROOT, OUT_PDF)}\n`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
