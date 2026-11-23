// node scripts/crop.mjs in.png out.png x y w h scale
import { chromium } from 'playwright';
import fs from 'node:fs';
const [inp, out, x, y, w, h, s = 2] = process.argv.slice(2);
const b = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const p = await b.newPage({ viewport: { width: Math.round(w * s), height: Math.round(h * s) } });
const data = fs.readFileSync(inp).toString('base64');
await p.setContent(`<body style="margin:0;overflow:hidden"><div style="width:${w*s}px;height:${h*s}px;background:url(data:image/png;base64,${data}) -${x*s}px -${y*s}px / ${1600*s}px ${900*s}px;image-rendering:pixelated"></div></body>`);
await p.screenshot({ path: out });
await b.close();
