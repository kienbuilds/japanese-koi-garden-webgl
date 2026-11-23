import * as THREE from 'three';
import { makeRng } from '../util/rng.js';

/**
 * Tileable ripple normal map: a spectrum of small sine waves with integer wave vectors
 * (so it wraps perfectly). RG = normal.xz, B = height, A = 1.
 */
export function createWaterNormalMap(size = 256, seed = 5, waves = 90, kMax = 14) {
  const rng = makeRng(seed);
  const W = [];
  for (let i = 0; i < waves; i++) {
    let kx, ky, k;
    do {
      kx = rng.int(-kMax, kMax);
      ky = rng.int(-kMax, kMax);
      k = Math.hypot(kx, ky);
    } while (k < 2);
    W.push({ kx, ky, a: Math.pow(k, -1.35) * rng.range(0.5, 1.0), ph: rng() * Math.PI * 2 });
  }
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      let s = 0;
      for (const w of W) s += w.a * Math.sin(w.kx * u + w.ky * v + w.ph);
      h[y * size + x] = s;
    }
  }
  let mn = Infinity, mx = -Infinity;
  for (const v of h) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  const strength = 2.2 / (mx - mn) * size / 64;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const n = new THREE.Vector3(-dx, 1, -dy).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.z * 0.5 + 0.5) * 255;
      data[i + 2] = ((h[y * size + x] - mn) / (mx - mn)) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
