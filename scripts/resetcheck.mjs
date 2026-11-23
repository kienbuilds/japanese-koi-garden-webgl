import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__koiReady === true, null, { timeout: 180000 });
const snap = () => p.evaluate(() => {
  const c = window.__koi.config;
  const sunDir = window.__koi.scene.environment ? 'env-ok' : 'no-env';
  return JSON.stringify({ az: c.sun.azimuth, el: c.sun.elevation, deep: c.water.deepColor, absR: c.water.absorption[0], exp: c.post.exposure, wind: c.wind.strength, env: sunDir });
});
const before = await snap();
await p.keyboard.press('g');
await p.waitForTimeout(300);
// open all folders and tweak values through the real controllers
const url0 = p.url();
await p.evaluate(() => {
  const gui = document.querySelector('.lil-gui.lil-root');
  gui.querySelectorAll('.lil-gui:not(.lil-root) > .lil-title').forEach((t) => t.click());
});
await p.evaluate(() => {
  const c = window.__koi.config;
  // emulate user edits via the controllers (so lil-gui state is dirty, like a real drag)
  const ctrls = window.__koiGui.controllersRecursive();
  const find = (prop, obj) => ctrls.find((x) => x.property === prop && (!obj || x.object === obj));
  find('azimuth').setValue(120); find('elevation').setValue(15);
  find('deepColor').setValue('#ff00ff'); find('0', c.water.absorption).setValue(3.3);
  find('exposure').setValue(2.5); find('strength', c.wind).setValue(3.7);
});
await p.waitForTimeout(500);
const edited = await snap();
await p.screenshot({ path: 'screenshots/reset_before.png' });
await p.getByText('Đặt về mặc định').click();
await p.waitForTimeout(400);
const label = await p.evaluate(() => [...document.querySelectorAll('.lil-name')].map((n) => n.textContent).find((t) => /Đã đặt lại|mặc định/.test(t)));
await p.screenshot({ path: 'screenshots/reset_after.png' });
const after = await snap();
console.log('before', before); console.log('edited', edited); console.log('after ', after);
console.log('restored:', before === after, '| label:', label, '| reloaded:', p.url() !== url0);
await p.waitForTimeout(1700);
console.log('label after 1.7s:', await p.evaluate(() => [...document.querySelectorAll('.lil-name')].map((n) => n.textContent).find((t) => /Đã đặt lại|mặc định/.test(t))));
console.log('errors:', errs.length ? errs.join(' | ') : 'none');
await b.close();
