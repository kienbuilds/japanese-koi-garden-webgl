// Average FPS over ~8 s (no screenshots): node scripts/fps.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5173/';
const b = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto(url);
await p.waitForFunction(() => window.__koiReady === true, null, { timeout: 180000 });
await p.waitForTimeout(2000);
const s = [];
for (let i = 0; i < 8; i++) { await p.waitForTimeout(1000); s.push(await p.evaluate(() => window.__koi.stats.fps)); }
console.log(url, 'fps samples:', s.map((v) => v.toFixed(0)).join(' '), 'avg', (s.reduce((a, b) => a + b) / s.length).toFixed(1));
await b.close();
