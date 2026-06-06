import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'test-results', 'product-screens');
fs.mkdirSync(outDir, { recursive: true });

async function capture() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const screens = [
    // Public pages
    { url: 'http://localhost:3000', name: '01-landing', desc: 'Landing / Home page' },
    { url: 'http://localhost:3000/sign-in', name: '02-sign-in', desc: 'Sign-in page' },
    { url: 'http://localhost:3000/sign-up', name: '03-sign-up', desc: 'Sign-up page' },

    // Student routes (may require auth)
    { url: 'http://localhost:3000/student', name: '04-student-dashboard', desc: 'Student dashboard' },
    { url: 'http://localhost:3000/student/exam', name: '05-student-exam', desc: 'Student exam page' },

    // Instructor routes (may require auth)
    { url: 'http://localhost:3000/instructor', name: '06-instructor-dashboard', desc: 'Instructor dashboard' },

    // Join page
    { url: 'http://localhost:3000/join', name: '07-join', desc: 'Join page' },

    // Onboarding
    { url: 'http://localhost:3000/onboarding', name: '08-onboarding', desc: 'Onboarding page' },

    // Admin
    { url: 'http://localhost:3000/admin', name: '09-admin', desc: 'Admin page' },

    // Legal
    { url: 'http://localhost:3000/legal', name: '10-legal', desc: 'Legal page' },
  ];

  for (const screen of screens) {
    try {
      console.log(`Capturing: ${screen.desc} (${screen.url})`);
      const response = await page.goto(screen.url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      const finalUrl = page.url();
      const status = response?.status() || 'unknown';

      await page.screenshot({ path: path.join(outDir, `${screen.name}.png`), fullPage: false });
      console.log(`  -> Saved ${screen.name}.png (status: ${status}, final URL: ${finalUrl})`);

      if (finalUrl !== screen.url && finalUrl.includes('sign-in')) {
        console.log(`  -> REDIRECTED to sign-in (auth required)`);
      }
    } catch (err) {
      console.log(`  -> ERROR: ${err.message}`);
    }
  }

  await browser.close();
  console.log('\nAll screenshots saved to:', outDir);
}

capture().catch(e => { console.error(e.message); process.exit(1); });
