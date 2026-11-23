// Contact sheet of video/preview/*.jpg → video/sheet_<a>-<b>.png
import { chromium } from 'playwright';
import fs from 'node:fs';
const [a = 0, b = 26, cols = 6] = process.argv.slice(2).map(Number);
const files = fs.readdirSync('video/preview').filter((f) => f.endsWith('.jpg')).sort().slice(a, b);
const w = 380, h = Math.round(w * 9 / 16);
const html = files.map((f) => `<div style="position:relative"><img src="data:image/jpeg;base64,${fs.readFileSync('video/preview/' + f).toString('base64')}" width=${w} height=${h}><span style="position:absolute;left:4px;top:2px;color:#fff;font:bold 14px sans-serif;text-shadow:0 0 3px #000">${f}</span></div>`).join('');
const b2 = await chromium.launch({ channel: 'chrome' });
const p = await b2.newPage({ viewport: { width: cols * (w + 4), height: Math.ceil(files.length / cols) * (h + 4) } });
await p.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:4px">${html}</body>`);
await p.screenshot({ path: `video/sheet_${a}-${b}.png` });
await b2.close();
