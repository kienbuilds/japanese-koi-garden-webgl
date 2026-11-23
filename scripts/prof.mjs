import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5173/';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto(url);
await p.waitForFunction(() => window.__koiReady === true, null, { timeout: 180000 });
await p.waitForTimeout(3000);
await p.evaluate(() => { window.__koi.pipeline.profile = true; window.__koi.pipeline.profAcc = null; });
await p.waitForTimeout(4000);
const acc = await p.evaluate(() => window.__koi.pipeline.profAcc);
const n = acc.n; delete acc.n;
let tot = 0; for (const k in acc) { tot += acc[k] / n; console.log(k.padEnd(14), (acc[k] / n).toFixed(2), 'ms'); }
console.log('total'.padEnd(14), tot.toFixed(2), 'ms');
await b.close();
