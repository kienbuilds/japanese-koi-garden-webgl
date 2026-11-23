import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5173/';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto(url);
await p.waitForFunction(() => window.__koiReady === true, null, { timeout: 180000 });
await p.waitForTimeout(3000);
const m = async (label, fn) => { await p.evaluate(fn); await p.waitForTimeout(2500); console.log(label.padEnd(26), (await p.evaluate(() => window.__koi.stats.fps)).toFixed(1)); };
await m('baseline', () => {});
await m('hide everything in scene', () => { window.__koi.scene.children.forEach(c => { c.userData.v = c.visible; c.visible = false; }); });
await m('restore; plain final only', () => {
  window.__koi.scene.children.forEach(c => c.visible = c.userData.v);
  const P = window.__koi.pipeline; P._render = P.render; P.render = function(t, dt){ this.final.pass.uniforms.tSrc.value = this.compRT.texture; this.final.pass.uniforms.tBloom.value = this.compRT.texture; this.final.pass.render(this.renderer, null); };
});
await m('main scene only', () => { const P = window.__koi.pipeline; P.render = function(){ const r=this.renderer; r.shadowMap.needsUpdate=false; r.setRenderTarget(this.mainRT); r.render(this.scene, this.camera); this.final.pass.uniforms.tSrc.value = this.compRT.texture; this.final.pass.render(r, null); }; });
await m('main, no terrain/rocks/backdrop', () => { const s = window.__koi.scene; s.children.forEach(c => { if (c.isMesh || (c.isGroup && c.children[0] && c.children[0].geometry && c.children[0].geometry.index && c.children[0].geometry.index.count > 100000)) c.visible = false; }); });
await b.close();
