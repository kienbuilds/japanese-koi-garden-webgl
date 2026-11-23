import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
await p.goto('http://localhost:5173/?q=low');
await p.waitForFunction(() => window.__koiReady === true, null, { timeout: 180000 });
await p.evaluate(() => window.__koi.pipeline.ripples.addDrop(0.2, 3.0, 0.08, 0.03));
for (const wait of [50, 400, 1000]) {
  await p.waitForTimeout(wait);
  console.log(wait, await p.evaluate(() => {
    const r = window.__koi.pipeline.ripples, R = window.__koi.renderer;
    const buf = new Uint16Array(256 * 256 * 4);
    R.readRenderTargetPixels(r.rtA, 0, 0, 256, 256, buf);
    const f = (h) => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * m * 2 ** -24 : s * (1 + m / 1024) * 2 ** (e - 15); };
    let mn = 1e9, mx = -1e9, cnt = 0;
    for (let i = 0; i < 256 * 256; i++) { const v = f(buf[i * 4]); mn = Math.min(mn, v); mx = Math.max(mx, v); if (Math.abs(v) > 1e-4) cnt++; }
    return `min ${mn.toFixed(4)} max ${mx.toFixed(4)} nonzero ${cnt}`;
  }));
}
await b.close();
