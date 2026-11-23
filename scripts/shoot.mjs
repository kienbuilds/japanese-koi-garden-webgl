// Playwright screenshot at 1600×900 + side-by-side comparison with reference.jpg.
// Usage: node scripts/shoot.mjs [url] [outName] [waitSeconds]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://localhost:5173/';
const name = process.argv[3] || 'shot';
const wait = Number(process.argv[4] || 6);
const outDir = path.resolve('screenshots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PW_CHANNEL || 'chrome',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__koiReady === true, null, { timeout: 180000 });
await page.waitForTimeout(wait * 1000);
const stats = await page.evaluate(() => ({ ...window.__koi.stats, gl: (() => {
  const gl = window.__koi.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
})() }));
const shotPath = path.join(outDir, `${name}.png`);
await page.screenshot({ path: shotPath });

// side-by-side page
const ref = fs.readFileSync(path.resolve('reference.jpg')).toString('base64');
const mine = fs.readFileSync(shotPath).toString('base64');
const cmp = await browser.newPage({ viewport: { width: 2400, height: 900 } });
await cmp.setContent(`<body style="margin:0;background:#111;display:flex;gap:8px;align-items:center">
  <img src="data:image/jpeg;base64,${ref}" style="height:900px">
  <img src="data:image/png;base64,${mine}" style="height:900px;width:1600px;object-fit:cover">
</body>`);
await cmp.screenshot({ path: path.join(outDir, `${name}_compare.png`) });
await browser.close();
console.log(JSON.stringify(stats));
const errs = logs.filter((l) => /error|warn/i.test(l));
console.log(errs.length ? errs.slice(0, 30).join('\n') : 'console: clean');
