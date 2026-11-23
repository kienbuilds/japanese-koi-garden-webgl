import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const logs = []; p.on('console', m => { if (/error|warn/i.test(m.type())) logs.push(m.text()); }); p.on('pageerror', e => logs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__koiReady === true, null, { timeout: 180000 });
await p.waitForTimeout(1500);
await p.evaluate(() => { const r = window.__koi.pipeline.ripples; r.addDrop(0.2, 3.0, 0.08, 0.03); r.addDrop(1.6, 2.0, 0.08, 0.03); });
await p.waitForTimeout(900);
await p.screenshot({ path: 'screenshots/ripple.png' });
// longer soak to catch runtime errors + natural surfacing events
await p.waitForTimeout(12000);
console.log('fps', await p.evaluate(() => window.__koi.stats.fps.toFixed(1)), 'errors:', logs.length ? logs.join(' | ') : 'none');
await b.close();
