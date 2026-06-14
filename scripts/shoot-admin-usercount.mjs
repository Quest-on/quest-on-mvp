// One-off marketing screenshot: admin dashboard with the real user count,
// captured in full context (sidebar, AI cards, user list) but with every
// piece of PII (names, emails, avatars) blurred IN THE DOM before capture,
// so no unmasked PII is ever written to disk.
// Usage: node scripts/shoot-admin-usercount.mjs
// Reads ADMIN_USERNAME / ADMIN_PASSWORD / BASE_URL from env.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3199";
const OUT = "marketing/linkedin/posts/assets/2026-06-14";

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
if (!username || !password) {
  console.error("Missing ADMIN_USERNAME / ADMIN_PASSWORD in env");
  process.exit(1);
}

// Drive the system-installed Google Chrome (no Playwright browser download needed).
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1120 },
  deviceScaleFactor: 2, // retina-crisp for marketing
  colorScheme: "light",
});
const page = await ctx.newPage();

// 1) Log in
await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
await page.fill("#username", username);
await page.fill("#password", password);
await Promise.all([
  page.waitForURL("**/admin", { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);

// 2) Wait for the stat cards to hydrate with the real total (non-zero)
await page.waitForSelector("text=전체 사용자", { timeout: 30000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector(".text-2xl.font-bold");
    if (!el) return false;
    const n = parseInt(el.textContent || "0", 10);
    return Number.isFinite(n) && n > 0;
  },
  { timeout: 30000 }
);
await page.waitForTimeout(800);

const total = await page.evaluate(() => {
  const el = document.querySelector(".text-2xl.font-bold");
  return el ? el.textContent?.trim() : null;
});
console.log("전체 사용자 =", total);

// 3) Mask all PII before any full-context capture.
// The user-management rows and the (amber) pending-instructor rows are the only
// `div.rounded-lg.border.p-4` on the page — the stat Cards are not p-4, so this
// selector touches exactly the PII rows and never the headline numbers.
const masked = await page.evaluate(() => {
  let names = 0,
    emails = 0,
    avatars = 0;
  const blur = (el, px) => {
    el.style.filter = `blur(${px}px)`;
    el.style.userSelect = "none";
  };
  document.querySelectorAll("div.rounded-lg.border.p-4").forEach((row) => {
    // names: <h3> (user) / <p class="font-medium"> (pending instructor)
    row.querySelectorAll("h3, p.font-medium").forEach((el) => {
      blur(el, 8);
      names++;
    });
    // emails: any leaf <p> containing "@"
    row.querySelectorAll("p").forEach((el) => {
      if (el.children.length === 0 && el.textContent && el.textContent.includes("@")) {
        blur(el, 8);
        emails++;
      }
    });
    // avatars (could be a real profile photo)
    row.querySelectorAll(".rounded-full").forEach((el) => {
      blur(el, 10);
      avatars++;
    });
  });
  return { names, emails, avatars };
});
console.log("masked:", masked);
await page.waitForTimeout(200);

// 4a) Masked viewport (primary post asset): cards + AI cards + several masked rows
await page.screenshot({ path: `${OUT}/admin-dashboard-masked.png`, fullPage: false });

// 4b) Masked full page (archive / alt): entire rendered list, all PII blurred
await page.screenshot({ path: `${OUT}/admin-dashboard-masked-full.png`, fullPage: true });

await browser.close();
console.log("Saved masked screenshots to", OUT);
