// Measures FPS with different features toggled off (rough cost breakdown).
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5173/';
const b = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto(url);
await p.waitForFunction(() => window.__koiReady === true, null, { timeout: 180000 });
await p.waitForTimeout(3000);
const measure = async (label, fn) => {
  await p.evaluate(fn);
  await p.waitForTimeout(2500);
  const fps = await p.evaluate(() => window.__koi.stats.fps);
  console.log(label.padEnd(28), fps.toFixed(1));
};
await measure('baseline', () => {});
await measure('no AO', () => { window.__koi.config.post.ao = 0; });
await measure('no godrays', () => { window.__koi.config.post.godRays = 0; });
await measure('no DOF', () => { window.__koi.config.post.dof = 0; });
await measure('no reflection scene', () => { const P = window.__koi.pipeline; P._r = P.reflRT; P.hideInReflection.push(...window.__koi.scene.children); });
await measure('no foliage', () => { window.__koi.veg.group.visible = false; });
await measure('no shadows update', () => { window.__koi.renderer.shadowMap.enabled = false; });
await b.close();
