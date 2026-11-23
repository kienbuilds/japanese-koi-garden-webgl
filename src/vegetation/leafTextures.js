import * as THREE from 'three';
import { makeRng } from '../util/rng.js';

// Leaf-cluster textures painted on a canvas. Transparent texels get the average leaf colour so
// mip-mapping does not produce dark fringes.
function finish(canvas, fill) {
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 255) {
      // un-premultiply edge texels toward the fill colour
      const k = a / 255;
      d[i] = d[i] * k + fill[0] * (1 - k);
      d[i + 1] = d[i + 1] * k + fill[1] * (1 - k);
      d[i + 2] = d[i + 2] * k + fill[2] * (1 - k);
    }
  }
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), canvas.width, canvas.height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function leafPath(g, len, wid, tip = 0.5) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid, len * 0.2, wid * 0.9, len * tip, 0, len);
  g.bezierCurveTo(-wid * 0.9, len * tip, -wid, len * 0.2, 0, 0);
  g.closePath();
}

function shadeLeaf(g, len, wid, base, rng) {
  const l = 0.75 + rng() * 0.5;
  const grad = g.createLinearGradient(-wid, 0, wid, len);
  const c = (k) => `rgb(${Math.min(255, base[0] * l * k)},${Math.min(255, base[1] * l * k)},${Math.min(255, base[2] * l * k)})`;
  grad.addColorStop(0, c(0.75));
  grad.addColorStop(0.5, c(1.15));
  grad.addColorStop(1, c(0.9));
  g.fillStyle = grad;
  g.fill();
  // midrib
  g.strokeStyle = c(1.35);
  g.lineWidth = Math.max(0.6, wid * 0.08);
  g.beginPath(); g.moveTo(0, len * 0.05); g.lineTo(0, len * 0.9); g.stroke();
}

/** Small glossy oval leaves, densely clustered — clipped azalea / boxwood. */
export function azaleaTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rng = makeRng(11);
  for (let i = 0; i < 230; i++) {
    const r = Math.sqrt(rng()) * S * 0.45;
    const a = rng() * Math.PI * 2;
    g.save();
    g.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    g.rotate(a + Math.PI / 2 + rng.range(-0.9, 0.9));
    const len = rng.range(15, 24), wid = len * rng.range(0.36, 0.46);
    leafPath(g, len, wid, 0.55);
    shadeLeaf(g, len, wid, [90, 108, 52], rng);
    g.restore();
  }
  return finish(c, [72, 100, 42]);
}

/** Pine needle tufts radiating from small centres. */
export function pineTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rng = makeRng(23);
  g.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const cx = S / 2 + rng.range(-70, 70), cy = S / 2 + rng.range(-70, 70);
    const n = 70;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const len = rng.range(30, 62);
      const l = rng.range(0.7, 1.25);
      g.strokeStyle = `rgb(${66 * l},${100 * l},${38 * l})`;
      g.lineWidth = rng.range(1.6, 2.6);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
      g.quadraticCurveTo(cx + Math.cos(a + 0.15) * len * 0.6, cy + Math.sin(a + 0.15) * len * 0.6, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.stroke();
    }
  }
  return finish(c, [60, 92, 36]);
}

/** Medium broad leaves — background trees / maple-ish. */
export function broadleafTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rng = makeRng(37);
  for (let i = 0; i < 60; i++) {
    const r = Math.sqrt(rng()) * S * 0.42;
    const a = rng() * Math.PI * 2;
    g.save();
    g.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    g.rotate(a + Math.PI / 2 + rng.range(-1, 1));
    const len = rng.range(34, 56), wid = len * rng.range(0.3, 0.42);
    leafPath(g, len, wid, 0.45);
    shadeLeaf(g, len, wid, [62, 104, 38], rng);
    g.restore();
  }
  return finish(c, [60, 100, 38]);
}

/** Long narrow bamboo leaves in fan-like sprays. */
export function bambooTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rng = makeRng(51);
  for (let k = 0; k < 5; k++) {
    const cx = rng.range(60, 196), cy = rng.range(40, 120);
    const n = rng.int(4, 7);
    for (let i = 0; i < n; i++) {
      g.save();
      g.translate(cx, cy);
      g.rotate(rng.range(-1.1, 1.1));
      const len = rng.range(80, 120), wid = len * 0.1;
      leafPath(g, len, wid, 0.35);
      shadeLeaf(g, len, wid, [92, 132, 46], rng);
      g.restore();
    }
  }
  return finish(c, [88, 126, 46]);
}

/** One fallen leaf (for floating leaves). */
export function fallenLeafTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S * 0.92);
  g.rotate(Math.PI);
  leafPath(g, S * 0.85, S * 0.3, 0.5);
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#7a4a18');
  grad.addColorStop(0.6, '#b07a2a');
  grad.addColorStop(1, '#8a5a1c');
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = '#5a3510'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, S * 0.8); g.stroke();
  for (let i = 1; i < 6; i++) {
    g.beginPath(); g.moveTo(0, i * 13); g.lineTo(16, i * 13 + 12); g.moveTo(0, i * 13); g.lineTo(-16, i * 13 + 12); g.stroke();
  }
  return finish(c, [120, 80, 30]);
}
