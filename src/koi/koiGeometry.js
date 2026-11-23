import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * Koi body in local space: forward = +X, up = +Y, total length ≈ 1 (snout at x = +0.5).
 * Attributes:
 *   aBody: x = along-body coordinate u (0 snout … 1 tail tip), y = part id
 *          (0 body, 1 caudal, 2 dorsal, 3 pectoral L, 4 pectoral R, 5 pelvic/anal, 6 barbel),
 *          z = fin coordinate (0 at the root … 1 at the edge)
 */
const SNOUT = 0.5, PED = -0.27, TAILEND = -0.5;

function profile(s) {
  // s: 0 snout .. 1 peduncle → height & width
  const front = 0.3;
  let f;
  if (s < front) { const k = s / front; f = Math.sqrt(1 - (1 - k) * (1 - k)); }
  else { const k = (s - front) / (1 - front); f = 1 - 0.74 * Math.pow(k, 1.25); }
  return { h: 0.2 * f, w: 0.205 * f * (s < 0.2 ? 1.0 : 1 - (s - 0.2) * 0.3) };
}

function bodyGeometry() {
  const rings = 44, seg = 22;
  const pos = [], body = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    const x = SNOUT + (PED - SNOUT) * s;
    const { h, w } = profile(Math.max(s, 0.004));
    const u = (SNOUT - x) / (SNOUT - TAILEND);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const cy = Math.cos(a), sz = Math.sin(a);
      // flatter belly, broad back, slightly lowered belly in the front half
      const y = cy > 0 ? cy * h * 0.5 : cy * h * 0.5 * (1.0 - 0.12 * (1 - s));
      const z = sz * w * 0.5 * (1 + 0.08 * cy);
      pos.push(x, y - 0.012 * (1 - s), z);
      body.push(u, 0, 0);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBody', new THREE.Float32BufferAttribute(body, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** A flat membrane fin from a function (t,v) -> [x,y,z]; double-sided. */
function finGeometry(nT, nV, fn, part, uFn) {
  const pos = [], body = [], idx = [];
  for (let i = 0; i <= nT; i++) {
    for (let j = 0; j <= nV; j++) {
      const t = i / nT, v = j / nV;
      const p = fn(t, v);
      pos.push(...p);
      body.push(uFn(p, t, v), part, t);
    }
  }
  const W = nV + 1;
  for (let i = 0; i < nT; i++) {
    for (let j = 0; j < nV; j++) {
      const a = i * W + j, b = a + W;
      idx.push(a, b, a + 1, b, b + 1, a + 1); // rendered double-sided by the material
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBody', new THREE.Float32BufferAttribute(body, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

const uOfX = (p) => (SNOUT - p[0]) / (SNOUT - TAILEND);

export function createKoiGeometry() {
  const parts = [bodyGeometry()];
  // caudal fin — broad, forked, slightly flowing
  parts.push(finGeometry(10, 12, (t, v) => {
    const vv = v * 2 - 1;                          // -1 bottom … 1 top
    const span = 0.03 + 0.12 * Math.pow(t, 0.8);  // half-height grows to the tips
    const fork = 0.035 * (1 - Math.abs(vv)) * t;    // notch in the middle
    const x = PED + 0.01 - (TAILEND - PED) * -1 * t * (0.75 + 0.25 * Math.abs(vv)) + fork;
    return [x, vv * span, 0];
  }, 1, uOfX));
  // dorsal fin along the back
  parts.push(finGeometry(10, 4, (t, v) => {
    const s = 0.36 + t * 0.4;
    const x = SNOUT + (PED - SNOUT) * s;
    const { h } = profile(s);
    const fh = 0.05 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.4 * t) + 0.004;
    return [x - v * 0.03, h * 0.5 - 0.004 + v * fh, 0];
  }, 2, (p, t, v) => uOfX(p)));
  // pectoral fins — rounded fans low on the sides
  for (const side of [-1, 1]) {
    parts.push(finGeometry(6, 8, (t, v) => {
      const a = (-0.5 + v) * 1.1;                  // fan angle
      const r = 0.085 * t * (0.75 + 0.25 * Math.cos(a * 1.4));
      const x = 0.2 - Math.cos(0.9 + a * 0.6) * r * 0.9;
      const y = -0.06 - r * 0.62;
      const z = side * (0.055 + Math.sin(0.9 + a * 0.6) * r * 0.85);
      return [x, y, z];
    }, side < 0 ? 3 : 4, () => 0.3));
  }
  // pelvic + anal fins
  for (const [sx, len, side] of [[-0.02, 0.07, -1], [-0.02, 0.07, 1], [-0.18, 0.06, 0]]) {
    parts.push(finGeometry(4, 4, (t, v) => {
      const x = sx - v * 0.05 - t * 0.03;
      const y = -0.075 + (sx < -0.1 ? 0.035 : 0) - t * len * 0.8;
      const z = side * (0.035 + t * 0.03);
      return [x, y, z];
    }, 5, (p) => uOfX(p)));
  }
  // barbels (two pairs of tiny whiskers at the mouth)
  for (const side of [-1, 1]) {
    for (const k of [0, 1]) {
      parts.push(finGeometry(3, 1, (t, v) => {
        const x = 0.475 - k * 0.02 - t * 0.035;
        const y = -0.025 - t * 0.018;
        const z = side * (0.022 + t * 0.03) + (v - 0.5) * 0.004;
        return [x, y, z];
      }, 6, (p) => uOfX(p)));
    }
  }
  const g = mergeGeometries(parts);
  return g;
}
