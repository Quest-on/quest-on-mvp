// Renders deck.html → per-slide PNGs (preview) + a combined PDF.
// Uses the system Chromium via CDP (Node built-in WebSocket/fetch — no npm deps).
// The PDF is assembled by hand from JPEG slide captures (each a full-bleed page),
// so it is pixel-identical to the PNG previews — no Chrome print/@page quirks.
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_BIN || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DECK = "file://" + resolve(__dirname, "deck.html");
const OUT_PNG = resolve(__dirname, "slides");
const OUT_PDF = resolve(__dirname, "Quest-On_Dongguk_Guide.pdf");
const PORT = 9000 + Math.floor(Math.random() * 900);
const USER_DIR = `/tmp/pw-deck-${process.pid}`;
const N_SLIDES = 10;
const W = 1280, H = 720, SCALE = 2;          // capture canvas; embedded px = W*SCALE × H*SCALE
const PW = 960, PH = 540;                     // PDF page size in pt (16:9 widescreen)

mkdirSync(OUT_PNG, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync(`pkill -9 -f 'remote-debugging-port=${PORT}'`); } catch {}

const chrome = spawn(CHROME, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none",
  `--user-data-dir=${USER_DIR}`, `--remote-debugging-port=${PORT}`,
  "--remote-allow-origins=*", "about:blank",
]);
chrome.stderr.on("data", () => {});

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome DevTools endpoint not reachable");
}

function makeClient(url) {
  const ws = new WebSocket(url);
  let id = 0; const pending = new Map();
  const ready = new Promise((res, rej) => {
    ws.addEventListener("open", () => res());
    ws.addEventListener("error", (e) => rej(e.error || new Error("ws error")));
  });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params }; if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject }); ws.send(JSON.stringify(msg));
  });
  return { ws, ready, send };
}

function buildPdf(jpegs, iw, ih) {
  const chunks = []; let len = 0; const off = {};
  const push = (s) => { const b = Buffer.isBuffer(s) ? s : Buffer.from(s, "binary"); chunks.push(b); len += b.length; };
  const mark = (n) => { off[n] = len; };
  push("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
  const N = jpegs.length;
  const pageIds = Array.from({ length: N }, (_, i) => 5 + i * 3);
  mark(1); push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  mark(2); push(`2 0 obj\n<< /Type /Pages /Count ${N} /Kids [${pageIds.map((id) => id + " 0 R").join(" ")}] /MediaBox [0 0 ${PW} ${PH}] >>\nendobj\n`);
  for (let i = 0; i < N; i++) {
    const imgId = 3 + i * 3, contId = 4 + i * 3, pageId = 5 + i * 3, jpg = jpegs[i];
    mark(imgId);
    push(`${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
    push(jpg); push("\nendstream\nendobj\n");
    const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    mark(contId);
    push(`${contId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    mark(pageId);
    push(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contId} 0 R >>\nendobj\n`);
  }
  const total = 2 + N * 3, xrefStart = len;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= total; n++) push(`${String(off[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

(async () => {
  const c = makeClient(await wsUrl());
  await c.ready;
  const { targetInfos } = await c.send("Target.getTargets");
  const page = targetInfos.find((t) => t.type === "page");
  const { sessionId } = await c.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  const S = (m, p) => c.send(m, p, sessionId);

  await S("Page.enable"); await S("Runtime.enable");
  await S("Emulation.setDeviceMetricsOverride", { width: W, height: H * N_SLIDES, deviceScaleFactor: SCALE, mobile: false });

  const loaded = new Promise((res) => {
    const h = (ev) => { const m = JSON.parse(ev.data); if (m.method === "Page.loadEventFired") { c.ws.removeEventListener("message", h); res(); } };
    c.ws.addEventListener("message", h);
  });
  await S("Page.navigate", { url: DECK });
  await loaded;
  await S("Runtime.evaluate", {
    expression: "Promise.all([document.fonts.ready, ...[...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))])",
    awaitPromise: true,
  });
  await sleep(600);

  const jpegs = [];
  for (let i = 0; i < N_SLIDES; i++) {
    const clip = { x: 0, y: i * H, width: W, height: H, scale: 1 };
    const png = await S("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
    const jpg = await S("Page.captureScreenshot", { format: "jpeg", quality: 92, clip, captureBeyondViewport: true });
    const n = String(i + 1).padStart(2, "0");
    writeFileSync(`${OUT_PNG}/slide-${n}.png`, Buffer.from(png.data, "base64"));
    jpegs.push(Buffer.from(jpg.data, "base64"));
    process.stdout.write(`${n} `);
  }
  console.log("");

  const pdf = buildPdf(jpegs, W * SCALE, H * SCALE);
  writeFileSync(OUT_PDF, pdf);
  console.log(`PDF → ${OUT_PDF} (${(pdf.length / 1e6).toFixed(2)} MB, ${N_SLIDES} pages @ ${PW}x${PH}pt)`);

  c.ws.close(); chrome.kill();
  try { execSync(`rm -rf ${USER_DIR}`); } catch {}
  process.exit(0);
})().catch((e) => { console.error("RENDER ERROR:", e); chrome.kill(); process.exit(1); });
