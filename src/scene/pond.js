import * as THREE from 'three';
import { fbm3 } from '../util/rng.js';

// Pond outline in world XZ (camera sits near z≈6.6 looking towards -z).
const OUTLINE = [
  [-0.7, 10.5], [-0.85, 7.0], [-1.1, 5.2], [-1.5, 3.8], [-2.15, 2.55], [-2.85, 1.35],
  [-3.25, 0.25], [-3.0, -0.75], [-2.15, -1.45], [-0.95, -1.8], [0.25, -1.55], [1.25, -1.85],
  [2.3, -1.7], [3.25, -1.25], [4.3, -0.65], [5.35, 0.15], [6.2, 1.35], [6.85, 3.2],
  [7.1, 5.6], [6.8, 10.5], [3.0, 11.5],
];

function catmull(points, samplesPer = 12) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let s = 0; s < samplesPer; s++) {
      const t = s / samplesPer, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

export const POLY = catmull(OUTLINE);

function polySDF(x, z) {
  let dmin = 1e9, inside = false;
  const n = POLY.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [ax, az] = POLY[j], [bx, bz] = POLY[i];
    const ex = bx - ax, ez = bz - az, wx = x - ax, wz = z - az;
    const t = Math.max(0, Math.min(1, (wx * ex + wz * ez) / (ex * ex + ez * ez)));
    const dx = wx - ex * t, dz = wz - ez * t;
    dmin = Math.min(dmin, dx * dx + dz * dz);
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return (inside ? -1 : 1) * Math.sqrt(dmin);
}

// Baked SDF grid (also uploaded to the GPU for the water & ripple shaders).
export const SDF_BOUNDS = { minX: -6, maxX: 10, minZ: -5, maxZ: 12 };
const RES = 256;
const grid = new Float32Array(RES * RES);
for (let j = 0; j < RES; j++) {
  for (let i = 0; i < RES; i++) {
    const x = SDF_BOUNDS.minX + (i / (RES - 1)) * (SDF_BOUNDS.maxX - SDF_BOUNDS.minX);
    const z = SDF_BOUNDS.minZ + (j / (RES - 1)) * (SDF_BOUNDS.maxZ - SDF_BOUNDS.minZ);
    grid[j * RES + i] = polySDF(x, z);
  }
}

export function pondSDF(x, z) {
  const u = ((x - SDF_BOUNDS.minX) / (SDF_BOUNDS.maxX - SDF_BOUNDS.minX)) * (RES - 1);
  const v = ((z - SDF_BOUNDS.minZ) / (SDF_BOUNDS.maxZ - SDF_BOUNDS.minZ)) * (RES - 1);
  if (u < 0 || v < 0 || u > RES - 1 || v > RES - 1) {
    // outside the baked area: approximate with distance to the box + 3
    return 3 + Math.max(-u, v - RES + 1, u - RES + 1, -v, 0) * 0.06;
  }
  const i = Math.min(RES - 2, Math.floor(u)), j = Math.min(RES - 2, Math.floor(v));
  const fu = u - i, fv = v - j;
  const g = (a, b) => grid[b * RES + a];
  return (g(i, j) * (1 - fu) + g(i + 1, j) * fu) * (1 - fv) + (g(i, j + 1) * (1 - fu) + g(i + 1, j + 1) * fu) * fv;
}

export function pondGradient(x, z) {
  const e = 0.05;
  const gx = pondSDF(x + e, z) - pondSDF(x - e, z);
  const gz = pondSDF(x, z + e) - pondSDF(x, z - e);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

export const sdfTexture = (() => {
  const t = new THREE.DataTexture(grid, RES, RES, THREE.RedFormat, THREE.FloatType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
})();

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Terrain height (y) at world x,z. Water surface is y = 0. */
export function terrainHeight(x, z) {
  const d = pondSDF(x, z);
  const n = fbm3(x * 0.6, 0.0, z * 0.6, 4);
  if (d < 0) {
    const deep = sstep(0, 0.45, -d);
    return -0.3 - 0.9 * deep + 0.06 * n - 0.05 * deep * fbm3(x * 2.1, 3.0, z * 2.1, 3);
  }
  let y = 0.035 + 0.3 * sstep(0, 0.5, d) + 0.05 * n * sstep(0, 1, d);
  // mounds: left (azalea hill), back (pine terrace), house platform
  y += 0.35 * sstep(-2.2, -5.0, x) * sstep(0, 1.5, d);
  y += 0.25 * sstep(-2.0, -5.5, z) * sstep(0, 1.0, d);
  y += 0.1 * fbm3(x * 0.25, 7.0, z * 0.25, 3) * sstep(0, 2, d);
  return y;
}
