// Render the intro film frame by frame and encode an MP4.
//   node scripts/record.mjs                      → video/koi-garden.mp4 (1920×1080, 60 fps, quality high)
//   node scripts/record.mjs --preview 10         → stills every second at 10 fps sim (fast check) in video/preview/
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const args = process.argv.slice(2);
const pv = args.indexOf('--preview');
const previewFps = pv >= 0 ? Number(args[pv + 1] || 10) : 0;
const fps = previewFps || 60;
const outDir = path.resolve('video', previewFps ? 'preview' : 'frames');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`http://localhost:5173/?capture&q=high&fps=${fps}`);
await page.waitForFunction(() => window.__cap && window.__koiReady, null, { timeout: 180000 });
const info = await page.evaluate(() => { window.__cap.warmup(); return { total: window.__cap.totalFrames, size: window.__cap.size }; });
console.log(`rendering ${info.total} frames at ${info.size.join('×')}, ${fps} fps`);
const t0 = Date.now();
for (let i = 0; i < info.total; i++) {
  const url = await page.evaluate((n) => window.__cap.frame(n), i);
  if (!previewFps || i % previewFps === 0) {
    const name = previewFps ? `t${String(i / previewFps).padStart(2, '0')}.jpg` : `${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(outDir, name), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  }
  if (i % 300 === 0) console.log(`  frame ${i}/${info.total}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
await browser.close();
if (!previewFps) {
  const mp4 = path.resolve('video', 'koi-garden.mp4');
  const r = spawnSync(ffmpeg, ['-y', '-framerate', '60', '-i', path.join(outDir, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) { console.error(r.stderr.toString().slice(-2000)); process.exit(1); }
  console.log('wrote', mp4, (fs.statSync(mp4).size / 1e6).toFixed(1), 'MB');
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
